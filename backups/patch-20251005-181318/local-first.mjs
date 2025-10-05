const rel = (p) => new URL(p, document.baseURI).toString();

let _libarchivePromise = null;
export async function loadLibarchive() {
  if (_libarchivePromise) return _libarchivePromise;
  _libarchivePromise = (async () => {
    try {
      const base = rel("vendor/libarchivejs/dist/");
      const m = await import(base + "main.js");
      const Archive = m?.Archive ?? m?.default?.Archive;
      if (!Archive) throw new Error("No Archive export");
      Archive.init({ workerUrl: base + "worker-bundle.js" });
      return { Archive };
    } catch {}
    const esm = "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/+esm";
    const worker = "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js";
    const mod = await import(esm);
    const Archive = mod.Archive ?? mod?.default?.Archive;
    if (!Archive) throw new Error("libarchive.js: Archive export not found");
    Archive.init({ workerUrl: worker });
    return { Archive };
  })();
  return _libarchivePromise;
}

let _sevenPromise = null;
export async function load7z() {
  if (_sevenPromise) return _sevenPromise;

  async function initFrom(jsUrl, wasmUrl) {
    const mod = await import(jsUrl);
    const factory = mod?.default ?? mod;
    if (typeof factory !== "function") throw new Error("[7z-wasm] factory missing");
    const inst = await factory({
      locateFile: (p) => (p.endsWith(".wasm") ? wasmUrl : p),
    });
    return inst;
  }

  const localJS   = rel("vendor/7z-wasm/7zz.es6.js");
  const localWasm = rel("vendor/7z-wasm/7zz.wasm");
  const cdnJS1    = "https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js";
  const cdnWasm1  = "https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.wasm";
  const cdnJS2    = "https://unpkg.com/7z-wasm@1.0.0-beta.5/7zz.es6.js";
  const cdnWasm2  = "https://unpkg.com/7z-wasm@1.0.0-beta.5/7zz.wasm";

  _sevenPromise = (async () => {
    try { return await initFrom(localJS, localWasm); }
    catch { try { return await initFrom(cdnJS1, cdnWasm1); }
           catch { return await initFrom(cdnJS2, cdnWasm2); } }
  })();

  return _sevenPromise;
}
