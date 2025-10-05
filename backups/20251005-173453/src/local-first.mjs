// local-first.mjs

const rel = (p) => new URL(p, document.baseURI).toString();

/** Simple one-shot memoization so multiple callers don't re-load the same libs */
let _jszipPromise = null;
let _libarchivePromise = null;
let _sevenPromise = null;

/* ===================== JSZip (kept for other features) ===================== */
export async function loadJSZip() {
  if (_jszipPromise) return _jszipPromise;

  _jszipPromise = (async () => {
    // Local vendor first (ESM build)
    try {
      const m = await import(rel('vendor/jszip/jszip.esm.js'));
      return m.default ?? m.JSZip ?? globalThis.JSZip;
    } catch (e1) {
      console.warn('[JSZip] local ESM not found, trying CDN (jsDelivr)', e1);
      try {
        // ESM-friendly build from @progress
        const m = await import('https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js');
        return m.default ?? m.JSZip ?? globalThis.JSZip;
      } catch (e2) {
        console.warn('[JSZip] jsDelivr failed, trying unpkg', e2);
        const m = await import('https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js');
        return m.default ?? m.JSZip ?? globalThis.JSZip;
      }
    }
  })();

  return _jszipPromise;
}

/* ===================== libarchive.js (LOCAL-FIRST + worker, with CDN fallback) ===================== */
/**
 * We standardize on libarchive.js (not libarchive-wasm).
 * Expect these locally (ship them with your app):
 *   vendor/libarchivejs/dist/esm/index.js
 *   vendor/libarchivejs/dist/worker-bundle.js
 *
 * If local import fails, we gracefully fall back to CDN.
 */
/* ===================== libarchive.js (LOCAL-FIRST; works with dist/main.js) ===================== */
export async function loadLibarchive() {
  if (typeof loadLibarchive._p !== 'undefined') return loadLibarchive._p;

  loadLibarchive._p = (async () => {
    const bases = [
      new URL('vendor/libarchivejs/dist/', document.baseURI).toString(),
      new URL('vendor/libarchive.js/dist/', document.baseURI).toString(), // alt folder name, just in case
    ];

    async function fromEsm(base) {
      // Many builds export Archive from dist/main.js as ESM
      const mod = await import(base + 'main.js');
      const Archive = mod?.Archive ?? mod?.default?.Archive;
      if (!Archive) throw new Error('No Archive export in ' + base + 'main.js');
      Archive.init({ workerUrl: base + 'worker-bundle.js' });
      return { Archive };
    }

    async function fromGlobal(base) {
      // Load classic UMD and read globalThis.libarchive
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = base + 'main.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ' + s.src));
        document.head.appendChild(s);
      });
      const Archive = globalThis.libarchive?.Archive;
      if (!Archive) throw new Error('global libarchive.Archive not found after loading ' + base + 'main.js');
      Archive.init({ workerUrl: base + 'worker-bundle.js' });
      return { Archive };
    }

    // Try local ESM first, then global fallback, for each base
    for (const base of bases) {
      try {
        return await fromEsm(base);
      } catch (e1) {
        console.warn('[libarchive] local ESM failed at', base, e1);
        try {
          return await fromGlobal(base);
        } catch (e2) {
          console.warn('[libarchive] local global fallback failed at', base, e2);
        }
      }
    }

    // Final fallback: CDN (ESM + worker)
    const cdnEsm = 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/+esm';
    const cdnWorker = 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js';
    const mod = await import(cdnEsm);
    const Archive = mod?.Archive ?? mod?.default?.Archive;
    if (!Archive) throw new Error('libarchive.js: Archive export not found from CDN');
    Archive.init({ workerUrl: cdnWorker });
    return { Archive };
  })();

  return loadLibarchive._p;
}

/* ===================== 7z-wasm (local-first with locateFile) ===================== */
export async function load7z() {
  if (_sevenPromise) return _sevenPromise;

  _sevenPromise = (async () => {
    const localJS = rel('vendor/7z-wasm/7zz.es6.js');
    const localWasm = rel('vendor/7z-wasm/7zz.wasm');

    const cdnJS1 = 'https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js';
    const cdnWasm1 = 'https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.wasm';

    const cdnJS2 = 'https://unpkg.com/7z-wasm@1.0.0-beta.5/7zz.es6.js';
    const cdnWasm2 = 'https://unpkg.com/7z-wasm@1.0.0-beta.5/7zz.wasm';

    async function initFrom(jsUrl, wasmUrl) {
      const mod = await import(jsUrl);
      const factory = mod?.default ?? mod;
      if (typeof factory !== 'function') {
        throw new Error('[7z-wasm] ESM did not export a factory function');
      }
      // The factory returns a Promise resolving to the ready Module instance
      return factory({
        locateFile: (p) => (p.endsWith('.wasm') ? wasmUrl : p),
      });
    }

    try {
      return await initFrom(localJS, localWasm);
    } catch (e1) {
      console.warn('[7z-wasm] local failed, trying jsDelivr', e1);
      try {
        return await initFrom(cdnJS1, cdnWasm1);
      } catch (e2) {
        console.warn('[7z-wasm] jsDelivr failed, trying unpkg', e2);
        return await initFrom(cdnJS2, cdnWasm2);
      }
    }
  })();

  return _sevenPromise;
}
