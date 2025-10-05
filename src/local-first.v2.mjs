const baseForUrls = (() => {
  try { return import.meta.url; } catch {}
  try { return self?.location?.href || "/"; } catch {}
  return "/";
})();
const rel = (p) => new URL(p, baseForUrls).toString();

let _libarchivePromise = null;
export async function loadLibarchive() {
  if (_libarchivePromise) return _libarchivePromise;
  _libarchivePromise = (async () => {
    // CDN first (your host 404'd libarchive previously)
    try {
      const esm    = "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/+esm";
      const worker = "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js";
      const mod = await import(esm);
      const Archive = mod?.Archive ?? mod?.default?.Archive;
      if (!Archive) throw new Error("libarchive.js: Archive export not found");
      Archive.init({ workerUrl: worker });
      return { Archive };
    } catch (e) {
      console.warn("[libarchive] CDN failed, trying local vendor", e);
    }

    // Local fallback (only if you deploy vendor/libarchivejs/dist/*)
    const base = rel("vendor/libarchivejs/dist/");
    const m = await import(base + "main.js");
    const Archive = m?.Archive ?? m?.default?.Archive;
    if (!Archive) throw new Error("No Archive export in local main.js");
    try { Archive.init({ workerUrl: base + "worker-bundle.js" }); }
    catch { Archive.init({ workerUrl: "https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js" }); }
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
    return factory({ locateFile: (p) => (p.endsWith(".wasm") ? wasmUrl : p) });
  }

  const localJS = rel("vendor/7z-wasm/7zz.es6.js");
  const localWasm = rel("vendor/7z-wasm/7zz.wasm");
  const cdnJS = "https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js";
  const cdnWasm = "https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.wasm";

  _sevenPromise = (async () => {
    try { return await initFrom(localJS, localWasm); }
    catch { return await initFrom(cdnJS, cdnWasm); }
  })();

  return _sevenPromise;
}
