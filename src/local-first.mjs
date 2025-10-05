/**
 * Local-first dynamic loaders with CDN fallback.
 * Usage:
 *   import { loadJSZip, loadLibarchive, load7z } from "./src/local-first.mjs";
 *
 * All local paths are resolved RELATIVE to THIS FILE via import.meta.url,
 * so hosting under a subpath (e.g. /convert/) works reliably.
 */

const local = (rel) => new URL(rel, import.meta.url).toString();

async function tryImport(url, label = url) {
  try {
    return await import(/* @vite-ignore */ url);
  } catch (err) {
    console.warn(`[loader] import failed: ${label}`, err);
    return null;
  }
}

/**
 * Load JSZip (constructor/class).
 * Returns the JSZip constructor (e.g., `const JSZip = await loadJSZip();`)
 */
export async function loadJSZip() {
  // 1) Local vendor (ESM)
  let m =
    await tryImport(local("../vendor/jszip/jszip.esm.js"), "local jszip.esm.js") ||
    // 2) CDN (jsDelivr)
    await tryImport(
      "https://cdn.jsdelivr.net/npm/@progress/jszip-esm@1.0.4/dist/jszip.min.js",
      "jsDelivr @progress/jszip-esm"
    ) ||
    // 3) CDN (unpkg)
    await tryImport(
      "https://unpkg.com/@progress/jszip-esm@1.0.4/dist/jszip.min.js",
      "unpkg @progress/jszip-esm"
    );

  if (!m) throw new Error("JSZip failed to load from all sources.");
  const JSZip = m.default || m.JSZip || globalThis.JSZip;
  if (!JSZip) throw new Error("JSZip module shape unexpected (no default/JSZip export).");
  return JSZip;
}

/**
 * Load libarchive with a consistent API surface.
 *
 * Returns one of:
 *   { kind: 'wasm', ArchiveReader, libarchive }
 *     - Use: `const reader = new ArchiveReader(libarchive, fileOrBuffer)`
 *
 *   { kind: 'js', Archive }
 *     - Use: `const a = await Archive.open(fileOrBuffer)`
 *
 * We prefer the WASM build for capability/perf. If unavailable, we fall back to libarchive.js.
 */
// local-first.mjs — use libarchive.js only (CDN first, local fallback)
// local-first.mjs — libarchive.js only (CDN → local)
export async function loadLibarchive() {
  let m =
    await tryImport("https://cdn.jsdelivr.net/npm/libarchive.js/main.js", "jsDelivr libarchive.js") ||
    await tryImport("https://unpkg.com/libarchive.js/main.js", "unpkg libarchive.js");

  if (!m) {
    const mainUrl = local("../vendor/libarchivejs/main.js");
    const workerUrl = local("../vendor/libarchivejs/dist/worker-bundle.js");
    const res = await fetch(mainUrl).catch(() => null);
    if (!res?.ok) throw new Error("libarchive.js not available (CDN + local failed).");
    m = await import(/* @vite-ignore */ mainUrl);
    const ArchiveLocal = m.Archive || m.default?.Archive;
    if (!ArchiveLocal) throw new Error("libarchive.js: Archive export not found (local).");
    ArchiveLocal.init({ workerUrl });
    return { kind: "js", Archive: ArchiveLocal };
  }

  const Archive = m.Archive || m.default?.Archive;
  if (!Archive) throw new Error("libarchive.js: Archive export not found (CDN).");
  const base = (m?.url && m.url.includes("unpkg.com"))
    ? "https://unpkg.com/libarchive.js"
    : "https://cdn.jsdelivr.net/npm/libarchive.js";
  Archive.init({ workerUrl: `${base}/dist/worker-bundle.js` });
  return { kind: "js", Archive };
}




/**
 * Load 7-Zip (WASM). Returns the initialized instance.
 * Usage:
 *   const seven = await load7z();
 *   // seven has .FS, .callMain(), etc. depending on build.
 */
export async function load7z() {
  let SevenMod =
    await tryImport(local("../vendor/7zz/7zz.es6.js"), "local 7z-wasm") ||
    await tryImport("https://cdn.jsdelivr.net/npm/7z-wasm@1.0.0-beta.5/7zz.es6.js", "jsDelivr 7z-wasm") ||
    await tryImport("https://cdn.jsdelivr.net/gh/use-strict/7z-wasm@v1.2.0/7zz.es6.js", "github 7z-wasm");

  if (!SevenMod) throw new Error("7z-wasm failed to load from all sources.");
  const factory = SevenMod.default || SevenMod.Seven || SevenMod.create;
  if (typeof factory !== "function") throw new Error("7z-wasm module shape unexpected (no default factory).");

  const seven = await factory({
    locateFile: (p) => p.endsWith(".wasm") ? local("../vendor/7zz/7zz.wasm") : p
  });
  return seven;
}

