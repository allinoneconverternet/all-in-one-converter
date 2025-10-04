const rel = (p) => new URL(p, document.baseURI).toString();

/* ===================== JSZip (kept for other features) ===================== */
export async function loadJSZip() {
  try {
    const m = await import(rel('vendor/jszip/jszip.esm.js'));
    return m.default ?? m.JSZip ?? globalThis.JSZip;
  } catch {
    try {
      const m = await import('https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js');
      return m.default ?? m.JSZip ?? globalThis.JSZip;
    } catch {
      const m = await import('https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js');
      return m.default ?? m.JSZip ?? globalThis.JSZip;
    }
  }
}

/* ===================== libarchive.js (CDN ESM + worker) ===================== */
export async function loadLibarchive() {
  const esm = 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/+esm';
  const worker = 'https://cdn.jsdelivr.net/npm/libarchive.js@2.0.2/dist/worker-bundle.js';
  const mod = await import(esm);
  const Archive = mod.Archive ?? mod?.default?.Archive;
  if (!Archive) throw new Error('libarchive.js: Archive export not found');
  Archive.init({ workerUrl: worker });
  return { Archive };
}

/* ===================== 7z-wasm (local-first with locateFile) ===================== */
export async function load7z() {
  const localJS   = rel('vendor/7z-wasm/7zz.es6.js');
  const localWasm = rel('vendor/7z-wasm/7zz.wasm');
  const cdnJS     = 'https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js';
  const cdnWasm   = 'https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.wasm';

  async function initFrom(jsUrl, wasmUrl) {
    const seven = await import(jsUrl);
    const factory = seven.default || seven;
    return factory({ locateFile: (p) => (p.endsWith('.wasm') ? wasmUrl : p) });
  }

  try { return await initFrom(localJS, localWasm); }
  catch (e) {
    console.warn('[7z-wasm] local failed, using CDN', e);
    return await initFrom(cdnJS, cdnWasm);
  }
}