/**
 * Local-first dynamic loaders with CDN fallback.
 * Usage:
 *   import { loadJSZip, loadLibarchive, load7z } from "/src/local-first.mjs";
 */

export async function loadJSZip() {
  try {
    const m = await import("/vendor/jszip/jszip.esm.js");
    return await m.default;
  } catch (e) {
    try {
      const m = await import("https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    } catch (e2) {
      const m = await import("https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js");
      return m.default || m.JSZip || globalThis.JSZip;
    }
  }
}

/* libarchive-wasm: ESM exports { ArchiveReader, libarchiveWasm } */
export async function loadLibarchive() {
  try {
    // Local ESM first
    const m = await import("/vendor/libarchive-wasm/index.mjs");
    const ArchiveReader = m.ArchiveReader || (m.default && m.default.ArchiveReader);
    const libarchiveWasm = m.libarchiveWasm || (m.default && m.default.libarchiveWasm);
    if (!ArchiveReader || !libarchiveWasm) throw new Error("Bad libarchive exports");
    return { ArchiveReader, libarchiveWasm };
  } catch (e) {
    console.warn("[libarchive] local failed, using CDN", e);
    // ESM CDN fallback
    const m = await import("https://cdn.jsdelivr.net/npm/libarchive-wasm@1.2.0/+esm");
    return { ArchiveReader: m.ArchiveReader, libarchiveWasm: m.libarchiveWasm };
  }
}

/* 7z-wasm: returns initialized module with FS + callMain */
export async function load7z() {
  try {
    const Seven = (await import("/vendor/7zz/7zz.es6.js")).default;
    return await Seven();
  } catch (e) {
    try {
      const Seven = (await import("https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js")).default;
      return await Seven();
    } catch (e2) {
      const Seven = (await import("https://cdn.jsdelivr.net/gh/use-strict/7z-wasm@v1.2.0/7zz.es6.js")).default;
      return await Seven();
    }
  }
}
