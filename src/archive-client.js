// archive-client.js (patched)

/* Use relative import + named exports from your local-first loader */
import { loadLibarchive, load7z } from "./src/local-first.mjs";

const WORK = "/work";
let _seven;

/* ---------- helpers ---------- */

async function ensureVendors() {
  if (!_seven) _seven = await load7z();
  return _seven;
}
function FS() { return _seven.FS; }

/* Normalize archive entry paths and prevent zip-slip */
function normalizePath(p) {
  return String(p || "")
    .replace(/^[A-Za-z]:/i, "")           // strip drive letters
    .replace(/^\/+/, "")                  // strip leading slashes
    .split(/[/\\]+/)
    .filter(seg => seg && seg !== "." && seg !== "..")
    .join("/");
}

async function toU8(input) {
  if (!input) throw new Error("No input");
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input.arrayBuffer) return new Uint8Array(await input.arrayBuffer());
  if (input.file?.arrayBuffer) return new Uint8Array(await input.file.arrayBuffer());
  if (input.blob?.arrayBuffer) return new Uint8Array(await input.blob.arrayBuffer());
  if (input.buffer && input.byteLength != null) {
    return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
  }
  throw new Error("Unsupported input type: " + Object.prototype.toString.call(input));
}

async function writeFile(path, data) {
  const fs = FS();
  const rel = normalizePath(path);
  const parts = rel.split("/").filter(Boolean);
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur += "/" + parts[i];
    try { fs.mkdir(cur); } catch { /* exists */ }
  }
  const u8 = data instanceof Uint8Array ? data : await toU8(data);
  fs.writeFile("/" + rel, u8);
}

async function readFile(path) {
  const fs = FS();
  const u8 = fs.readFile(path);
  // Use the Uint8Array itself (not .buffer) to avoid over-reading the underlying heap.
  return new Blob([u8], { type: "application/octet-stream" });
}

function removeDir(path) {
  const fs = FS();
  try {
    const info = fs.analyzePath(path);
    if (!info.exists) return;
    for (const name of fs.readdir(path)) {
      if (name === "." || name === "..") continue;
      const p = path + "/" + name;
      const st = fs.stat(p);
      if (fs.isDir(st.mode)) { removeDir(p); try { fs.rmdir(p); } catch { } }
      else { try { fs.unlink(p); } catch { } }
    }
  } catch { /* ignore */ }
}

/* ---------- extraction ---------- */

async function extractWith7z(input, outDir = WORK + "/in") {
  const seven = await ensureVendors();
  const fs = FS();
  try { fs.mkdir(WORK); } catch { }
  try { fs.mkdir(outDir); } catch { }
  removeDir(outDir); // clean
  await writeFile(WORK + "/src.bin", input);
  // extract all to /work/in
  await seven.callMain(["x", WORK + "/src.bin", "-o" + outDir, "-y", "-bd"]);
  return outDir;
}

async function extractWithLibarchive(input, outDir = WORK + "/in") {
  await ensureVendors(); // ensure FS exists
  const fs = FS();
  try { fs.mkdir(WORK); } catch { }
  try { fs.mkdir(outDir); } catch { }
  removeDir(outDir); // clean

  const lib = await loadLibarchive();
  const buf = await toU8(input);

  // Helper to read any entry object to a Uint8Array
  async function entryToU8(entry) {
    if (typeof entry.read === "function") {
      const data = await entry.read();
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    }
    if (typeof entry.getData === "function") {
      const data = await entry.getData();
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    }
    if (typeof entry.getStream === "function") {
      const stream = await entry.getStream();
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    }
    if (typeof entry.stream === "function") {
      const stream = await entry.stream();
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    }
    if (entry.file) return toU8(entry.file);
    throw new Error("Unknown libarchive entry API shape");
  }

  if (lib.kind === "wasm") {
    // libarchive-wasm
    const reader = new lib.ArchiveReader(lib.libarchive, buf);
    for await (const entry of reader) {
      const rawPath = entry.path || entry.name || entry.filename;
      const rel = normalizePath(rawPath);
      if (!rel) continue;
      // directories often come as trailing slash or size===0 with dir flag
      if (entry.isDirectory || /\/$/.test(rawPath)) {
        try { fs.mkdir(outDir + "/" + rel); } catch { }
        continue;
      }
      const data = await entryToU8(entry);
      await writeFile(`${outDir}/${rel}`, data);
    }
    try { await reader.close?.(); } catch { }
  } else {
    // libarchive.js (worker-based)
    const a = await lib.Archive.open(buf);
    try {
      let files;
      if (typeof a.getFilesArray === "function") files = await a.getFilesArray();
      else if (typeof a.extractFiles === "function") files = await a.extractFiles();
      else if (Array.isArray(a.files)) files = a.files;
      else throw new Error("libarchive.js: unknown reader API");

      for (const f of files) {
        const rawPath = f.path || f.name || f.file?.name;
        const rel = normalizePath(rawPath);
        if (!rel) continue;
        // skip directories (libarchive.js sometimes exposes them without a File)
        if (!f.file || (f.file.size === 0 && /\/$/.test(rawPath))) {
          try { fs.mkdir(outDir + "/" + rel); } catch { }
          continue;
        }
        await writeFile(`${outDir}/${rel}`, f.file);
      }
    } finally {
      try { await a.close?.(); } catch { }
    }
  }

  return outDir;
}

/* ---------- packing ---------- */

async function packFromDir(dir, target) {
  const seven = await ensureVendors();
  const fs = FS();
  try { fs.mkdir(WORK); } catch { }

  const out = (name) => `${WORK}/${name}`;
  const is = (t) => t === target;

  if (is("zip")) { await seven.callMain(["a", "-tzip", out("out.zip"), dir, "-bd"]); return out("out.zip"); }
  if (is("7z")) { await seven.callMain(["a", "-t7z", out("out.7z"), dir, "-bd"]); return out("out.7z"); }
  if (is("tar")) { await seven.callMain(["a", "-ttar", out("out.tar"), dir, "-bd"]); return out("out.tar"); }

  if (is("tar.gz")) {
    await seven.callMain(["a", "-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a", "-tgzip", out("out.tar.gz"), out("out.tar"), "-bd"]);
    try { fs.unlink(out("out.tar")); } catch { }
    return out("out.tar.gz");
  }
  if (is("tar.bz2")) {
    await seven.callMain(["a", "-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a", "-tbzip2", out("out.tar.bz2"), out("out.tar"), "-bd"]);
    try { fs.unlink(out("out.tar")); } catch { }
    return out("out.tar.bz2");
  }
  if (is("tar.xz")) {
    await seven.callMain(["a", "-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a", "-txz", out("out.tar.xz"), out("out.tar"), "-bd"]);
    try { fs.unlink(out("out.tar")); } catch { }
    return out("out.tar.xz");
  }

  throw new Error("Unsupported archive target: " + target);
}

/* ---------- public API ---------- */

// 1) let convert accept single file or array (for multi-part), + opts
export async function convertArchiveFile(input, target, opts = {}) {
  // input: File/Blob OR File[] for multi-part archives
  const files = Array.isArray(input) ? input : [input];
  if (!files.length) throw new Error("No file(s) provided");

  // write all inputs into the work dir
  await ensureVendors();
  const fs = FS();
  try { fs.mkdir(WORK); } catch { }
  const inDir = WORK + "/src";
  try { fs.mkdir(inDir); } catch { }
  for (const f of files) {
    const name = f.name || "part";
    await writeFile(`${inDir}/${name}`, f);
  }

  // choose the "primary" part for 7z (rar: .part1.rar | .r00 | .001 | .rar)
  const primary = pickPrimary(files.map(f => f.name || ""));
  const primaryPath = primary ? `${inDir}/${primary}` : `${inDir}/${files[0].name}`;

  // extract (7z first; fall back to libarchive.js)
  let dir;
  try {
    dir = await extractWith7zPrimary(primaryPath, WORK + "/in", opts.password);
  } catch (e) {
    console.warn("[archive] 7z extract failed, falling back to libarchive.js:", e);
    dir = await extractWithLibarchive(fs.readFile(primaryPath), WORK + "/in");
  }

  const outPath = await packFromDir(dir, target);
  const blob = await readFile(outPath);

  // cleanup
  try {
    removeDir(WORK + "/in"); try { fs.rmdir(WORK + "/in"); } catch { }
    removeDir(inDir); try { fs.rmdir(inDir); } catch { }
    try { fs.unlink(outPath); } catch { }
  } catch { }

  const base = (Array.isArray(input) ? files[0].name : (input.name || "archive"))
    .replace(/\.(zip|rar|7z|tar|tgz|tbz2|txz|tar\.gz|tar\.bz2|tar\.xz)$/i, "");
  return { blob, suggestedName: `${base}.${target}` };
}

// 2) helper: pick the first RAR/7z part sensibly
function pickPrimary(names) {
  const norm = n => n?.toLowerCase() || "";
  const by = (pat) => names.find(n => pat.test(norm(n)));
  return (
    by(/\.part0*1\.rar$/) ||
    by(/\.r00$/) ||
    by(/\.0*1$/) ||
    by(/\.rar$/) ||
    by(/\.(7z|zip|tar|tgz|tbz2|txz)$/) ||
    names[0]
  );
}

// 3) extraction via 7z with optional password
async function extractWith7zPrimary(path, outDir, password) {
  const seven = await ensureVendors();
  const fs = FS();
  try { fs.mkdir(outDir); } catch { }
  removeDir(outDir);

  const args = ["x", path, "-o" + outDir, "-y", "-bd"];
  if (password) args.splice(1, 0, `-p${password}`); // note: no space after -p
  await seven.callMain(args);
  return outDir;
}

