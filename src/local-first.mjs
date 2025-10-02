/**
 * Local-first dynamic loaders with CDN fallback.
 * Usage:
 *   import { loadJSZip, loadLibarchive, load7z } from "/src/local-first.mjs";
 */

export async function loadJSZip() {
  try {
    const m = await import("/vendor/jszip/jszip.esm.js");
    return await m.default;
  } catch (e1) {
    try {
      const m = await import("https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    } catch (e2) {
      const m = await import("https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    }
  }
}

/* libarchive.js (browser): ESM exports { Archive } */
/* libarchive.js (browser): ESM exports { Archive } */
export async function loadLibarchive() {
  // Try local vendor first (HEAD probe to avoid 404 noise)
  try {
    const probe = await fetch("/vendor/libarchivejs/main.js", { method: "HEAD" });
    if (probe.ok) {
      const m = await import("/vendor/libarchivejs/main.js");
      const Archive = m.Archive || (m.default && m.default.Archive);
      if (!Archive) throw new Error("libarchive.js: Archive export not found (local)");
      Archive.init({ workerUrl: "/vendor/libarchivejs/dist/worker-bundle.js" });
      return { Archive, libarchiveWasm: async () => null };
    }
    throw new Error("local vendor missing");
  } catch (e1) {
    console.warn("[libarchive] local missing/failed, trying CDN (jsDelivr)", e1);
    try {
      const m = await import("https://cdn.jsdelivr.net/npm/libarchive.js/main.js");
      const Archive = m.Archive || (m.default && m.default.Archive);
      if (!Archive) throw new Error("libarchive.js: Archive export not found (jsDelivr)");
      Archive.init({ workerUrl: "https://cdn.jsdelivr.net/npm/libarchive.js/dist/worker-bundle.js" });
      return { Archive, libarchiveWasm: async () => null };
    } catch (e2) {
      console.warn("[libarchive] jsDelivr failed, trying unpkg", e2);
      const m = await import("https://unpkg.com/libarchive.js/main.js");
      const Archive = m.Archive || (m.default && m.default.Archive);
      if (!Archive) throw new Error("libarchive.js: Archive export not found (unpkg)");
      Archive.init({ workerUrl: "https://unpkg.com/libarchive.js/dist/worker-bundle.js" });
      return { Archive, libarchiveWasm: async () => null };
    }
  }
}


export async function load7z() {
  try {
    const Seven = (await import("/vendor/7zz/7zz.es6.js")).default;
    return await Seven();
  } catch (e1) {
    try {
      const Seven = (await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js")).default;
      return await Seven();
    } catch (e2) {
      const Seven = (await import("https://cdn.jsdelivr.net/gh/use-strict/7z-wasm@v1.2.0/7zz.es6.js")).default;
      return await Seven();
    }
  }
}

