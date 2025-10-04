import { load7z, loadLibarchive } from "./local-first.mjs";

const WORK = "/work";
let _seven;

async function ensureVendors() {
  if (!_seven) _seven = await load7z();
  return _seven;
}
function FS() { return _seven.FS; }

async function toU8(input) {
  if (!input) throw new Error("No input");
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input.arrayBuffer) return new Uint8Array(await input.arrayBuffer());
  if (input.file?.arrayBuffer) return new Uint8Array(await input.file.arrayBuffer());
  if (input.blob?.arrayBuffer) return new Uint8Array(await input.blob.arrayBuffer());
  // typed arrays?
  if (input.buffer && input.byteLength != null) return new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
  throw new Error("Unsupported input type: " + Object.prototype.toString.call(input));
}

async function writeFile(path, data) {
  const fs = FS();
  const parts = path.split("/").filter(Boolean);
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur += "/" + parts[i];
    try { fs.mkdir(cur); } catch {}
  }
  const u8 = data instanceof Uint8Array ? data : await toU8(data);
  fs.writeFile(path, u8);
}
async function readFile(path) {
  const fs = FS();
  const u8 = fs.readFile(path);
  return new Blob([u8.buffer], { type: "application/octet-stream" });
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
      if (fs.isDir(st.mode)) { removeDir(p); try { fs.rmdir(p); } catch {} }
      else { try { fs.unlink(p); } catch {} }
    }
  } catch {}
}

async function extractWith7z(input, outDir = WORK + "/in") {
  const seven = await ensureVendors();
  const fs = FS();
  try { fs.mkdir(WORK); } catch {}
  try { fs.mkdir(outDir); } catch {}
  removeDir(outDir); // clean
  await writeFile(WORK + "/src.bin", input);
  // extract all to /work/in
  await seven.callMain(["x", WORK + "/src.bin", "-o" + outDir, "-y", "-bd"]);
  return outDir;
}

async function extractWithLibarchive(input, outDir = WORK + "/in") {
  await ensureVendors(); // ensure FS exists
  const fs = FS();
  try { fs.mkdir(WORK); } catch {}
  try { fs.mkdir(outDir); } catch {}
  removeDir(outDir); // clean

  const { Archive } = await loadLibarchive();
  const buf = await toU8(input);
  const a = await Archive.open(buf);
  try {
    for await (const entry of a) {
      if (entry?.file && entry?.file.size >= 0) {
        await writeFile(`${outDir}/${entry.path}`, entry.file);
      }
    }
  } finally {
    try { await a.close?.(); } catch {}
  }
  return outDir;
}

async function packFromDir(dir, target) {
  const seven = await ensureVendors();
  const fs = FS();
  try { fs.mkdir(WORK); } catch {}

  const out = (name) => `${WORK}/${name}`;
  const is = (t) => t === target;

  if (is("zip"))  { await seven.callMain(["a","-tzip", out("out.zip"),  dir, "-bd"]); return out("out.zip"); }
  if (is("7z"))   { await seven.callMain(["a","-t7z",  out("out.7z"),   dir, "-bd"]); return out("out.7z"); }
  if (is("tar"))  { await seven.callMain(["a","-ttar", out("out.tar"),  dir, "-bd"]); return out("out.tar"); }

  if (is("tar.gz")) {
    await seven.callMain(["a","-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a","-tgzip", out("out.tar.gz"), out("out.tar"), "-bd"]);
    return out("out.tar.gz");
  }
  if (is("tar.bz2")) {
    await seven.callMain(["a","-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a","-tbzip2", out("out.tar.bz2"), out("out.tar"), "-bd"]);
    return out("out.tar.bz2");
  }
  if (is("tar.xz")) {
    await seven.callMain(["a","-ttar", out("out.tar"), dir, "-bd"]);
    await seven.callMain(["a","-txz", out("out.tar.xz"), out("out.tar"), "-bd"]);
    return out("out.tar.xz");
  }

  throw new Error("Unsupported archive target: " + target);
}

export async function convertArchiveFile(file, target /* 'zip'|'7z'|'tar'|'tar.gz'|'tar.bz2'|'tar.xz' */) {
  const src = file?.arrayBuffer ? file : (file?.file || file?.blob || file);
  if (!src) throw new Error("convertArchiveFile(): no File/Blob provided");

  const name = file?.name || file?.file?.name || "archive";
  const base = name.replace(/\.(zip|rar|7z|tar|tgz|tbz2|txz|tar\.gz|tar\.bz2|tar\.xz)$/i, "");

  let dir;
  try { dir = await extractWith7z(src); }
  catch (e) {
    console.warn("[archive] 7z extract failed, falling back to libarchive:", e);
    dir = await extractWithLibarchive(src);
  }

  const outPath = await packFromDir(dir, target);
  const blob = await readFile(outPath);

  // cleanup
  try {
    const fs = FS();
    try { fs.unlink(`${WORK}/src.bin`); } catch {}
    try { fs.unlink(outPath); } catch {}
    try { fs.unlink(`${WORK}/out.tar`); } catch {}
    removeDir(`${WORK}/in`); try { FS().rmdir(`${WORK}/in`); } catch {}
  } catch (err) { console.warn("Archive FS cleanup failed:", err); }

  return { blob, suggestedName: `${base}.${target}` };
}