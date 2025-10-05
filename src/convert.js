// convert.js — large-archive friendly, OPFS-first, space-safe repack
// Works for ZIP/7Z/TAR/(TAR.gz/bz2/xz) and RAR4 input (no RAR5).
// Key changes:
//  - Extract directly to FS (OPFS if available), no huge in-memory arrays
//  - Repack from inside the extracted dir using '.' (robust to spaces)
//  - Adaptive low-memory flags for big trees
//  - Progress preserved (0–60% extract, 60–98% pack)

import { loadLibarchive, load7z } from './local-first.v2.mjs';
// NOTE: no need for run7z; we call seven.callMain directly

let _emit = (v) => { };
export function setProgressHook(fn) { _emit = typeof fn === "function" ? fn : () => { }; }

function sanitizePath(p) {
  return String(p || "")
    .replace(/^[a-zA-Z]:[\\/]/, "")
    .replace(/^[/\\]+/, "")
    .replace(/\0/g, "")
    .split(/[/\\]+/)
    .filter(seg => seg !== "" && seg !== "." && seg !== "..")
    .join("/");
}

export function sniffArchive(u8) {
  const s = (n) => u8.subarray(0, n);
  const rar4 = s(7).every((b, i) => [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00][i] === b);
  const rar5 = s(8).every((b, i) => [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00][i] === b);
  const seven = s(6).every((b, i) => [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C][i] === b);
  const zip = u8[0] === 0x50 && u8[1] === 0x4B;
  return { rar4, rar5, seven, zip };
}

// ---------- FS helpers ----------
function ensureDirTree(FS, path) {
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (const seg of parts) {
    cur += "/" + seg;
    if (!FS.analyzePath(cur).exists) {
      try { FS.mkdir(cur); } catch { /* ok */ }
    }
  }
}

function rmTree(FS, dir) {
  try {
    for (const e of FS.readdir(dir)) {
      if (e === "." || e === "..") continue;
      const p = dir + "/" + e;
      const st = FS.stat(p);
      if (FS.isDir(st.mode)) rmTree(FS, p);
      else FS.unlink(p);
    }
    if (dir !== "/") FS.rmdir(dir);
  } catch { /* best effort */ }
}

function walkStats(FS, dir) {
  let files = 0, bytes = 0;
  (function walk(d) {
    for (const e of FS.readdir(d)) {
      if (e === "." || e === "..") continue;
      const p = d + "/" + e;
      const st = FS.stat(p);
      if (FS.isDir(st.mode)) walk(p);
      else if (FS.isFile(st.mode)) { files++; bytes += st.size | 0; }
    }
  })(dir);
  return { files, bytes };
}

function mountOPFSIfAvailable(FS) {
  try {
    if (FS.filesystems && FS.filesystems.OPFS) {
      try { FS.mkdir("/opfs"); } catch { }
      FS.mount(FS.filesystems.OPFS, {}, "/opfs");
      return "/opfs";
    }
  } catch { }
  return ""; // fallback to MEMFS root
}

// ---------- Extraction ----------
async function extractToDirWith7z(u8, destDir, percentStart = 0.0, percentEnd = 0.60) {
  const seven = await load7z();
  const FS = seven.FS;

  const TMP = destDir + "/tmp-" + Math.random().toString(36).slice(2);
  ensureDirTree(FS, TMP);
  FS.writeFile(TMP + "/in.bin", u8);

  const prevPrint = seven.print;
  seven.print = (line) => {
    const m = /(\d{1,3})%/.exec(line);
    if (m) {
      const p = parseInt(m[1], 10) / 100;
      _emit(percentStart + Math.min(percentEnd - percentStart, p * (percentEnd - percentStart)));
    }
  };

  try {
    await seven.callMain(["x", TMP + "/in.bin", "-o" + destDir, "-y", "-bsp1", "-aoa"]);
  } finally {
    seven.print = prevPrint;
    try { FS.unlink(TMP + "/in.bin"); FS.rmdir(TMP); } catch { }
  }
}

async function extractToDirWithLibarchive(u8, destDir, percentStart = 0.0, percentEnd = 0.60) {
  const { Archive } = await loadLibarchive();
  const a = await Archive.open(u8);
  const seven = await load7z(); // for FS access
  const FS = seven.FS;

  let total = 0, seen = 0;
  try { while (await a.nextEntry()) total++; await a.seek(0); }
  catch { total = 0; await a.seek(0); }

  let ent;
  while ((ent = await a.nextEntry())) {
    const clean = sanitizePath(ent.path);
    if (!clean) { seen++; continue; }

    if (ent.filetype === "directory") {
      ensureDirTree(FS, destDir + "/" + clean);
    } else if (ent.filetype === "file") {
      const dir = destDir + "/" + clean.split("/").slice(0, -1).join("/");
      if (dir !== destDir) ensureDirTree(FS, dir);
      const buf = new Uint8Array(await a.readData()); // per-file buffer only
      FS.writeFile(destDir + "/" + clean, buf, { canOwn: true });
      if (typeof ent.mode === "number") {
        try { FS.chmod(destDir + "/" + clean, ent.mode & 0o777); } catch { }
      }
    }
    seen++;
    if (total) {
      const p = seen / total;
      _emit(percentStart + Math.min(percentEnd - percentStart, p * (percentEnd - percentStart)));
    }
  }
  await a.close();
}

// ---------- Packing ----------
function lowMemFlags(fmt, big) {
  // conservative defaults for big trees; small ones still fine with these
  if (fmt === "7z") {
    return big
      ? ["-mx=3", "-m0=lzma2:d=32m,fb=64", "-ms=off", "-mmt=1"]
      : ["-mx=5", "-ms=off", "-mmt=1"];
  }
  if (fmt === "zip") {
    return big ? ["-mx=3", "-mmt=1"] : ["-mx=5", "-mmt=1"];
  }
  if (fmt === "xz") {
    // used only for tar.xz second step
    return big ? ["-m0=lzma2:d=32m,fb=64", "-mmt=1"] : ["-m0=lzma2:d=64m,fb=80", "-mmt=1"];
  }
  return ["-mmt=1"];
}

async function packDirWith7z(srcDir, outFmt, outDir, percentStart = 0.60, percentEnd = 0.98) {
  const seven = await load7z();
  const FS = seven.FS;

  ensureDirTree(FS, outDir);

  const baseOut = outDir + "/archive";
  const fmt = (outFmt === "zip" || outFmt === "7z" || outFmt === "tar" ||
    outFmt === "tar.gz" || outFmt === "tar.bz2" || outFmt === "tar.xz") ? outFmt : "zip";

  const tarPath = baseOut + ".tar";
  const finalPath =
    fmt === "zip" ? baseOut + ".zip" :
      fmt === "7z" ? baseOut + ".7z" :
        fmt === "tar" ? tarPath :
          fmt === "tar.gz" ? tarPath + ".gz" :
            fmt === "tar.bz2" ? tarPath + ".bz2" : tarPath + ".xz";

  // Decide "big" after extraction by walking srcDir
  const { files, bytes } = walkStats(FS, srcDir);
  const BIG = files >= 2000 || bytes >= 200 * 1024 * 1024; // 2k files or 200MB+

  const prevPrint = seven.print;
  seven.print = (line) => {
    const m = /(\d{1,3})%/.exec(line);
    if (m) {
      const p = parseInt(m[1], 10) / 100;
      _emit(percentStart + Math.min(percentEnd - percentStart, p * (percentEnd - percentStart)));
    }
  };

  const prevCwd = FS.cwd();
  try {
    // Critical: work from inside srcDir; input is '.' (no quoting/wildcards)
    FS.chdir(srcDir);

    if (fmt === "zip") {
      await seven.callMain(["a", "-tzip", finalPath, ".", ...lowMemFlags("zip", BIG), "-y", "-bsp1"]);
    } else if (fmt === "7z") {
      await seven.callMain(["a", "-t7z", finalPath, ".", ...lowMemFlags("7z", BIG), "-y", "-bsp1"]);
    } else if (fmt === "tar") {
      await seven.callMain(["a", "-ttar", tarPath, ".", "-y", "-bsp1"]);
    } else {
      // tar.* two-step to keep memory bounded
      await seven.callMain(["a", "-ttar", tarPath, ".", "-y", "-bsp1"]);
      if (fmt === "tar.gz") {
        await seven.callMain(["a", "-tgzip", finalPath, tarPath, "-y", "-bsp1"]);
      } else if (fmt === "tar.bz2") {
        await seven.callMain(["a", "-tbzip2", finalPath, tarPath, "-y", "-bsp1"]);
      } else { // tar.xz
        await seven.callMain(["a", "-txz", finalPath, tarPath, ...lowMemFlags("xz", BIG), "-y", "-bsp1"]);
      }
    }
  } finally {
    seven.print = prevPrint;
    try { FS.chdir(prevCwd); } catch { }
  }

  if (!FS.analyzePath(finalPath).exists) {
    throw new Error("Packing failed: output file not found.");
  }
  return { path: finalPath, stats: { files, bytes, BIG } };
}

// ---------- Public API ----------
export async function convertArchive(inputU8, outFmt) {
  const { rar4, rar5 } = sniffArchive(inputU8);
  if (rar5) throw new Error("RAR v5 is not supported in this offline build.");

  const seven = await load7z();
  const FS = seven.FS;

  // Prefer OPFS for big jobs; silently fall back to MEMFS if unavailable
  const ROOT = mountOPFSIfAvailable(FS); // "" means MEMFS
  const WORK = (ROOT || "") + "/conv-" + Math.random().toString(36).slice(2);
  const SRC = WORK + "/src";
  const OUT = WORK + "/out";
  ensureDirTree(FS, SRC);
  ensureDirTree(FS, OUT);

  _emit(0.02);

  try {
    // Extract directly to SRC (no in-memory file array)
    if (rar4) {
      await extractToDirWithLibarchive(inputU8, SRC, 0.02, 0.60);
    } else {
      await extractToDirWith7z(inputU8, SRC, 0.02, 0.60);
    }

    _emit(0.62);

    // Pack from SRC into OUT
    const { path: finalPath } = await packDirWith7z(SRC, outFmt, OUT, 0.60, 0.98);

    _emit(0.99);

    // Read the result (single buffer at the very end)
    const outU8 = FS.readFile(finalPath);

    _emit(1);
    return outU8;
  } finally {
    // Best-effort cleanup to free OPFS space and MEMFS RAM
    try { rmTree(FS, WORK); } catch { }
  }
}
