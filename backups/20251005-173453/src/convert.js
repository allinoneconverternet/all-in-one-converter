import { load7z, loadLibarchive } from "./local-first.mjs";

function sanitizePath(p) {
  return p
    .replace(/^[a-zA-Z]:[\\/]/, "")
    .replace(/^[/\\]+/, "")
    .replace(/\0/g, "")
    .split(/[/\\]+/)
    .filter(seg => seg !== "" && seg !== "." && seg !== "..")
    .join("/");
}

export function sniffArchive(u8) {
  const s = (n) => u8.subarray(0, n);
  const rar4 = s(7).every((b,i)=>[0x52,0x61,0x72,0x21,0x1A,0x07,0x00][i]===b);
  const rar5 = s(8).every((b,i)=>[0x52,0x61,0x72,0x21,0x1A,0x07,0x01,0x00][i]===b);
  const seven = s(6).every((b,i)=>[0x37,0x7A,0xBC,0xAF,0x27,0x1C][i]===b);
  const zip = u8[0]===0x50 && u8[1]===0x4B;
  return { rar4, rar5, seven, zip };
}

export async function extractWith7z(u8) {
  const seven = await load7z();
  const FS = seven.FS;
  const WORK = "/w-" + Math.random().toString(36).slice(2);
  FS.mkdir(WORK);
  FS.writeFile(WORK + "/in.bin", u8);
  const OUT = WORK + "/out"; FS.mkdir(OUT);

  await seven.callMain(["x", WORK + "/in.bin", "-o" + OUT, "-y", "-bd", "-bso0", "-bsp0"]);

  const files = [];
  (function walk(dir, prefix="") {
    for (const e of FS.readdir(dir)) {
      if (e === "." || e === "..") continue;
      const p = dir + "/" + e;
      const st = FS.stat(p);
      if (FS.isDir(st.mode)) {
        walk(p, prefix + e + "/");
      } else if (FS.isFile(st.mode)) {
        const bytes = FS.readFile(p);
        files.push({ path: sanitizePath(prefix + e), bytes, mode: st.mode });
      }
    }
  })(OUT);

  return files;
}

export async function extractWithLibarchive(u8) {
  const { Archive } = await loadLibarchive();
  const a = await Archive.open(u8);
  const out = [];
  let ent;
  while ((ent = await a.nextEntry())) {
    if (ent.filetype === "file") {
      const bytes = new Uint8Array(await a.readData());
      out.push({ path: sanitizePath(ent.path), bytes, mode: ent.mode });
    }
  }
  await a.close();
  return out;
}

export async function createArchiveWith7z(files, outFmt) {
  const seven = await load7z();
  const FS = seven.FS;
  const WORK = "/p-" + Math.random().toString(36).slice(2);
  const SRC = WORK + "/src"; const OUT = WORK + "/out";
  FS.mkdir(WORK); FS.mkdir(SRC); FS.mkdir(OUT);

  for (const f of files) {
    const parts = f.path.split("/").filter(Boolean);
    let d = SRC;
    for (let i=0; i<parts.length-1; i++) { d += "/" + parts[i]; try{ FS.mkdir(d); } catch {} }
    FS.writeFile(d + "/" + parts.at(-1), f.bytes, { canOwn: true });
  }

  const baseOut = OUT + "/archive";
  const type =
    outFmt === "zip" ? "zip" :
    outFmt === "7z"  ? "7z"  :
    outFmt.startsWith("tar") ? "tar" : "zip";

  const tarPath = baseOut + ".tar";
  const finalPath =
    outFmt === "zip" ? baseOut + ".zip" :
    outFmt === "7z"  ? baseOut + ".7z"  :
    outFmt === "tar" ? tarPath :
    outFmt === "tar.gz"  ? tarPath + ".gz"  :
    outFmt === "tar.bz2" ? tarPath + ".bz2" :
    outFmt === "tar.xz"  ? tarPath + ".xz"  :
    baseOut + ".zip";

  await seven.callMain(["a", `-t${type}`, "-mx=5", "-bd", "-bso0", "-bsp0", type==="tar" ? tarPath : finalPath, SRC + "/"]);

  if (outFmt === "tar.gz")  await seven.callMain(["a","-tgzip",  finalPath, tarPath, "-bd","-bso0","-bsp0"]);
  if (outFmt === "tar.bz2") await seven.callMain(["a","-tbzip2", finalPath, tarPath, "-bd","-bso0","-bsp0"]);
  if (outFmt === "tar.xz")  await seven.callMain(["a","-txz",    finalPath, tarPath, "-bd","-bso0","-bsp0"]);

  return FS.readFile(finalPath);
}

export async function convertArchive(inputU8, outFmt) {
  const { rar4, rar5 } = sniffArchive(inputU8);
  if (rar5) throw new Error("RAR v5 is not supported in this offline build.");

  let files;
  try {
    files = rar4 ? await extractWithLibarchive(inputU8) : await extractWith7z(inputU8);
  } catch {
    files = await extractWithLibarchive(inputU8);
  }
  if (!files.length) throw new Error("No files found in archive.");
  return await createArchiveWith7z(files, outFmt);
}
