/**
 * Local-first dynamic loaders with CDN fallback.
 * Usage:
 *   import { loadJSZip, loadLibarchive, load7z } from "/src/local-first.mjs";
 */

export async function loadJSZip() {
  try {
    const m = await import("/vendor/jszip/jszip.esm.js");
    return await m.default;
  } catch {
    try {
      const m = await import("https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    } catch {
      const m = await import("https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    }
  }
}

/* libarchive-wasm: ESM exports { ArchiveReader, libarchiveWasm } */
export async function loadLibarchive() {
  try {
    return await import("/vendor/libarchive-wasm/dist/index.js");
  } catch {
    try {
      return await import("https://cdn.jsdelivr.net/npm/libarchive-wasm@1.2.0/dist/index.js");
    } catch {
      return await import("https://unpkg.com/libarchive-wasm@1.2.0/dist/index.js");
    }
  }
}

/* 7z-wasm: returns initialized module with FS + callMain */
export async function load7z() {
  try {
    const Seven = (await import("/vendor/7zz/7zz.es6.js")).default;
    return await Seven();
  } catch {
    try {
      const Seven = (await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js")).default;
      return await Seven();
    } catch {
      const Seven = (await import("https://cdn.jsdelivr.net/gh/use-strict/7z-wasm@v1.2.0/7zz.es6.js")).default;
      return await Seven();
    }
  }
}
