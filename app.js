// === DEBUG INSTRUMENTATION v3 ===
window.DEBUG_CONVERTER = true;
function DBG() { try { if (window.DEBUG_CONVERTER) console.log.apply(console, arguments); } catch (e) { } }
function DBGW() { try { if (window.DEBUG_CONVERTER) console.warn.apply(console, arguments); } catch (e) { } }
function DBGE() { try { if (window.DEBUG_CONVERTER) console.error.apply(console, arguments); } catch (e) { } }
/* 1) Find/attach the FFmpeg wrapper no matter how it exports */
// --- FFmpeg wrapper bootstrap (drop-in) ---
// Guard against double-injection during dev
window.FFMPEG_VER = window.FFMPEG_VER || '0.12.10';
var FFMPEG_VER = window.FFMPEG_VER;  // <— was 'const', change to 'var'

var _warmFFmpegOnce = window._warmFFmpegOnce || null;  // ⬅️ change this line
if (window.__APP_ALREADY_LOADED__) throw new Error('app.js loaded twice');
window.__APP_ALREADY_LOADED__ = true;

// adopt any known global shape
function adoptFFmpegGlobal() {
  const cands = [
    () => globalThis.FFmpeg,
    () => window.FFmpeg,
    () => window.FFmpegWASM?.FFmpeg,
    () => window.FFmpegWASM,
    () => window.FFmpegWasm,
    () => window.ffmpeg, // some forks
  ];
  for (const get of cands) {
    const g = get();
    if (g && typeof g.createFFmpeg === 'function') {
      window.FFmpeg = g;
      return true;
    }
  }
  return false;
}

// Local-only: adopt/create a FFmpeg global from the local UMD wrapper.
// No CDN, no ESM import — prevents cross-origin Worker.
async function ensureFFmpegGlobal() {
  // already present?
  if (window.FFmpeg?.createFFmpeg) return true;

  // load the local classic UMD wrapper
  try {
    await (function loadClassicScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
        document.head.appendChild(s);
      });
    })('vendor/ffmpeg/ffmpeg.js');
  } catch (e) {
    console.error('Local ffmpeg.js failed to load:', e);
    return false;
  }

  // normalize alt namespace (some builds export as FFmpegWASM)
  if (!window.FFmpeg?.createFFmpeg && window.FFmpegWASM?.FFmpeg) {
    const FFmpegClass = window.FFmpegWASM.FFmpeg;
    const fetchFile = window.FFmpegWASM.fetchFile;
    window.FFmpeg = { createFFmpeg: (opts = {}) => new FFmpegClass(opts), fetchFile };
  }

  return !!(window.FFmpeg && window.FFmpeg.createFFmpeg);
}


function show(msg, kind = 'info') {
  if (typeof showBanner === 'function') return showBanner(msg, kind);
  console[kind === 'error' ? 'error' : 'log'](msg);
}

async function headOrGet(url) {
  try {
    let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok && r.status === 405) r = await fetch(url, { method: 'GET', cache: 'no-store' });
    return { url, ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '' };
  } catch (e) {
    return { url, ok: false, status: 0, error: String(e?.message || e) };
  }
}

function loadClassicScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;            // classic script (NOT type="module")
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function diagnoseWrapper(src, reason) {
  const h = await headOrGet(src);
  console.log('[FFmpeg wrapper check]', h);
  if (!h.ok) {
    show(`FFmpeg wrapper not reachable at ${src}`, 'error');
  } else if (!/javascript|ecmascript/i.test(h.ct)) {
    show(`FFmpeg wrapper served as ${h.ct} (likely an HTML fallback).`, 'error');
  } else {
    show(reason || 'ffmpeg.js loaded but did not expose createFFmpeg (wrong build/namespace).', 'error');
  }
}

function show(msg, kind = 'info') {
  if (typeof showBanner === 'function') return showBanner(msg, kind);
  console[kind === 'error' ? 'error' : 'log'](msg);
}

// === END DEBUG INSTRUMENTATION v3 ===

/* app.js — full, fixed, copy-paste ready (waits for vendor libs) */

/* ========= 1) Config toggles ========= */
// Config toggles (add media: true)
const ENABLE_OUTPUTS = {
  images: true,        // PNG, JPEG, WebP, SVG
  documents: true,     // PDF, DOCX
  text: true,          // TXT, MD, HTML, CSV, JSON, JSONL, RTF
  spreadsheets: true,  // XLSX
  media: true          // ✅ MP3, WAV, OGG, M4A, MP4, WebM, GIF
};
let _ffmpegInstance = null;
async function needMammoth() {
  if (window.mammoth) return;
  try { await loadScript('vendor/mammoth.browser.min.js'); }
  catch { await loadScript('https://unpkg.com/mammoth/mammoth.browser.min.js'); }
}

// Robust PDF.js loader: UMD or ESM, local first then CDN. No script tag for the worker.
async function needPdf() {
  if (window.pdfjsLib?.getDocument) { features.pdf = true; ensureVendors?.(); return; }

  // helper to load a script tag
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });

  // 1) main library: local UMD → CDN UMD → local ESM → CDN ESM
  const tryMain = [
    () => loadScript('vendor/pdf.min.js'),
    () => loadScript('https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.min.js'),
    async () => { window.pdfjsLib = await import('vendor/pdf.min.mjs'); },
    async () => { window.pdfjsLib = await import('https://unpkg.com/pdfjs-dist@4/build/pdf.min.mjs'); },
  ];
  for (const step of tryMain) { try { await step(); break; } catch { } }
  if (!window.pdfjsLib?.getDocument) throw new Error('Unable to load PDF.js');

  // 2) worker: choose a reachable URL (don’t inject it as a <script>)
  const candidates = [
    'vendor/pdf.worker.min.js',
    'vendor/pdf.worker.min.mjs',
    'https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.worker.min.js',
    'https://unpkg.com/pdfjs-dist@4/build/pdf.worker.min.mjs',
  ];
  let workerSrc = candidates[0];
  for (const url of candidates) {
    try {
      const ok = await fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => r.ok);
      if (ok) { workerSrc = url; break; }
    } catch { /* file:// or offline -> keep default */ }
  }
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  features.pdf = true;
  ensureVendors?.();   // refresh the red/green badges
}


async function needXLSX() { if (window.XLSX) return; await loadScriptTry(CDN.xlsx[0], CDN.xlsx[1]); }
async function needJSZip() { if (window.JSZip) return; await loadScriptTry(CDN.jszip[0], CDN.jszip[1]); }
async function needJsPDF() { if (window.jspdf?.jsPDF) return; await loadScriptTry(CDN.jspdf[0], CDN.jspdf[1]); }
async function needDocx() { if (window.docx) return; await loadScriptTry(CDN.docx[0], CDN.docx[1]); }

// Populate the dropdown from these (popular output types)
const TARGET_GROUPS = {
  text: [
    ['txt', 'Plain text (.txt)'],
    ['md', 'Markdown (.md)'],
    ['html', 'HTML (.html)'],
    ['csv', 'CSV (.csv)'],
    ['json', 'JSON (.json)'],
    ['jsonl', 'JSON Lines (.jsonl)'],
    ['rtf', 'Rich Text (.rtf)']
  ],
  documents: [
    ['pdf', 'PDF (.pdf)'],
    ['docx', 'Word DOCX (.docx)']
  ],
  spreadsheets: [
    ['xlsx', 'Excel XLSX (.xlsx)']
  ],
  images: [
    ['png', 'PNG (.png)'],
    ['jpeg', 'JPEG (.jpg)'],
    ['webp', 'WebP (.webp)'],
    ['svg', 'SVG (.svg)']
  ],
  media: [
    ['mp3', 'Audio MP3 (.mp3)'],
    ['wav', 'Audio WAV (.wav)'],
    ['ogg', 'Audio OGG (.ogg)'],
    ['m4a', 'Audio M4A (.m4a)'],
    ['mp4', 'Video MP4 (.mp4)'],
    ['webm', 'Video WebM (.webm)'],
    ['gif', 'GIF from video (.gif)']
  ]
};

// Optional: show the demo ad panels
const SHOW_ADS = true;

/* ========= 2) Small helpers ========= */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const fmtBytes = b => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`; };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[m]
  ));

const swapExt = (name, ext) => (name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name) + '.' + ext;
const baseName = n => (n.lastIndexOf('.') > 0 ? n.slice(0, n.lastIndexOf('.')) : n);

function estimateSafeBudgetBytes() {
  try { if (performance?.memory?.jsHeapSizeLimit) { const lim = performance.memory.jsHeapSizeLimit; return Math.max(80 * 1024 * 1024, Math.min(lim * 0.15, 500 * 1024 * 1024)); } } catch (e) { }
  const dm = navigator.deviceMemory || 4; const est = dm * 0.05 * 1024 * 1024 * 1024; return Math.max(80 * 1024 * 1024, Math.min(est, 400 * 1024 * 1024));
}

/* ========= 3) Vendor loader with local+CDN fallback ========= */
const features = { pdf: false, docx: false, xlsx: false, pptx: false, ocr: false, makePdf: false, makeDocx: false, ffmpeg: false };


function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + url));
    document.head.appendChild(s);
  });
}
const CDN = {

  pdf: ['vendor/pdf.min.js', 'https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.min.js'],
  pdfWorker: ['vendor/pdf.worker.min.js', 'https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.worker.min.js'],

  mammoth: ['vendor/mammoth.browser.min.js', 'https://unpkg.com/mammoth/mammoth.browser.min.js'],
  xlsx: ['vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js'],
  jszip: ['vendor/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip/dist/jszip.min.js'],
  tesseract: ['vendor/tesseract.min.js', 'https://cdn.jsdelivr.net/npm/tesseract.js/dist/tesseract.min.js'],
  jspdf: ['vendor/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf/dist/jspdf.umd.min.js'],
  docx: ['vendor/docx.min.js', 'https://cdn.jsdelivr.net/npm/docx/build/index.min.js'],
  ffmpeg: ['vendor/ffmpeg/ffmpeg.js', 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js'],
  ffmpegCore: ['vendor/ffmpeg/ffmpeg-core.js', 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js'],
};
async function loadScriptTry(localUrl, cdnUrl) {
  try { await loadScript(localUrl); }
  catch { console.warn('Local missing, using CDN:', cdnUrl); await loadScript(cdnUrl); }
}
// spread the NodeList correctly
function loadedSrcContains(substr) {
  const s = [...document.querySelectorAll('script[src]')].map(n => n.src);
  return s.find(u => u.includes(substr));
}

let ffmpegInstance = null;


// needFFmpeg(): cross-browser loader with MT (if isolated) and ST fallback
// Robust FFmpeg loader: CDN wrapper, normalize globals, MT when isolated, ST fallback
// Robust FFmpeg loader: LOCAL wrapper -> CDN fallback, MT when isolated, ST fallback
async function needFFmpeg() {
  if (window.__ffmpeg?.loaded || window.__ffmpeg?.isLoaded?.()) return window.__ffmpeg;

  const VER = '0.12.10';

  // 1) Wrapper candidates (LOCAL first to avoid cross-origin Worker error)
  const WRAPPERS = [
    'vendor/ffmpeg/ffmpeg.js',                                                  // ← local official UMD (0.12.10)
    `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${VER}/dist/umd/ffmpeg.js`,
    `https://unpkg.com/@ffmpeg/ffmpeg@${VER}/dist/umd/ffmpeg.js`
  ];

  // 2) Cores (UMD). Use MT only when SharedArrayBuffer is allowed
  const CORE_ST = `https://unpkg.com/@ffmpeg/core@${VER}/dist/umd/ffmpeg-core.js`;
  const CORE_MT = `https://unpkg.com/@ffmpeg/core-mt@${VER}/dist/umd/ffmpeg-core.js`;
  const useMT = !!window.crossOriginIsolated;
  const coreURL = useMT ? CORE_MT : CORE_ST;
  const wasmURL = coreURL.replace(/\.js$/, '.wasm');
  const workerURL = coreURL.replace(/\.js$/, '.worker.js');

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => queueMicrotask(resolve);
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });

  const pickApi = () => {
    if (window.FFmpeg?.FFmpeg || window.FFmpeg?.createFFmpeg) {
      return { ns: window.FFmpeg, hasClass: !!window.FFmpeg.FFmpeg, hasFactory: !!window.FFmpeg.createFFmpeg };
    }
    if (window.FFmpegWASM?.FFmpeg || window.FFmpegWASM?.createFFmpeg) {
      window.FFmpeg = window.FFmpegWASM; // normalize
      return { ns: window.FFmpegWASM, hasClass: !!window.FFmpegWASM.FFmpeg, hasFactory: !!window.FFmpegWASM.createFFmpeg };
    }
    return null;
  };

  let api = pickApi();
  for (const url of (!api ? WRAPPERS : [])) {
    try {
      console.log('[FFmpeg wrapper] loading', url);
      await loadScript(url);
      api = pickApi();
      if (api) break;
    } catch (e) {
      console.warn('[FFmpeg wrapper] failed', url, e);
    }
  }
  if (!api) {
    console.error('[FFmpeg] diagnostics: crossOriginIsolated=', window.crossOriginIsolated);
    throw new Error('FFmpeg UMD wrapper failed to load');
  }

  let ff;
  if (api.hasClass) ff = new api.ns.FFmpeg();              // 0.12 class
  else if (api.hasFactory) ff = api.ns.createFFmpeg();     // legacy factory
  else throw new Error('FFmpeg wrapper exposes neither class nor factory');

  // ---- replace your onProgress handler with this ----
  const onProgress = (payload = {}) => {
    // 0.12 sends {progress: 0..1, time, fps, ...}; older sends {ratio: 0..1}
    let val = Number.isFinite(payload.progress) ? payload.progress
      : Number.isFinite(payload.ratio) ? payload.ratio
        : 0;

    // clamp and sanitize
    if (!Number.isFinite(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 1) val = 1;

    const pct = Math.round(val * 100);
    console.log('[ffmpeg] progress', pct + '%');

    const g = document.getElementById('global-ffmpeg-progress');
    if (g && 'value' in g) g.value = pct;
  };
  // wire it (keep both models)
  if (typeof ff.on === 'function') {
    ff.on('progress', onProgress);
    ff.on('log', ({ type, message }) => {
      if (type === 'info' || type === 'fferr' || type === 'ffout') console.log('[ffmpeg]', type, message);
    });
  } else if (typeof ff.setProgress === 'function') {
    ff.setProgress(onProgress);
  }

  if (typeof ff.on === 'function') {
    ff.on('log', ({ type, message }) => {
      if (type === 'info' || type === 'fferr' || type === 'ffout') console.log('[ffmpeg]', type, message);
    });
    ff.on('progress', onProgress);
  } else if (typeof ff.setProgress === 'function') {
    ff.setProgress(onProgress);
  }

  if (typeof ff.load === 'function') {
    await ff.load({
      log: true,
      coreURL: coreURL,
      wasmURL: wasmURL,
      workerURL: workerURL
    });
  } else {
    // ancient factory fallback
    ff = api.ns.createFFmpeg({ log: true, corePath: coreURL });
    await ff.load();
  }

  if (!window.fetchFile && api.ns?.fetchFile) window.fetchFile = api.ns.fetchFile;

  window.__ffmpeg = ff;
  return ff;
}





(function prewarmFFmpeg() {
  const kick = () => { try { needFFmpeg(); } catch { } window.removeEventListener('pointerdown', kick); };
  if ('requestIdleCallback' in window) requestIdleCallback(() => { try { needFFmpeg(); } catch { } });
  window.addEventListener('pointerdown', kick, { once: true });
})();





// app.js — detect-only vendor check
// Copy–paste this whole function
async function ensureVendors() {
  // --- feature detection ---
  features.pdf = !!window.pdfjsLib;
  features.docx = !!window.mammoth;
  features.xlsx = !!window.XLSX;
  features.pptx = !!window.JSZip;
  features.ocr = !!window.Tesseract;
  features.makePdf = !!(window.jspdf && window.jspdf.jsPDF);
  features.makeDocx = !!window.docx;
  features.ffmpeg = !!(window.FFmpeg && window.FFmpeg.createFFmpeg);

  // --- tiny banner helper (falls back to console if your app doesn't have showBanner) ---
  const show = (msg, kind = 'info') => {
    if (typeof showBanner === 'function') return showBanner(msg, kind);
    console[kind === 'error' ? 'error' : 'log'](msg);
  };

  // --- on-demand FFmpeg diagnostics (scoped to this function) ---
  async function diagnoseFFmpeg() {
    const issues = [];
    const checks = [];

    const headOrGet = async (url) => {
      const common = { cache: 'no-store', redirect: 'follow' };
      try {
        let r = await fetch(url, { method: 'HEAD', ...common });
        if (!r.ok && r.status === 405) r = await fetch(url, { method: 'GET', ...common });
        return { url, ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '' };
      } catch (e) {
        return { url, ok: false, status: 0, error: (e && e.message) || String(e) };
      }
    };

    if (location.protocol === 'file:') {
      issues.push('Running over file:// — serve the site via http(s) so the browser can fetch WASM.');
    }

    // Wrapper present?
    const wrapperTag = [...document.querySelectorAll('script[src]')].find(s => /(^|\/)ffmpeg\.js(\?|$)/.test(s.src));
    const wrapperHasGlobal = !!(window.FFmpeg && window.FFmpeg.createFFmpeg);
    if (!wrapperTag) issues.push('ffmpeg.js (wrapper) <script> not found.');
    if (wrapperTag && !wrapperHasGlobal) issues.push('ffmpeg.js loaded but window.FFmpeg.createFFmpeg is unavailable (CSP/namespace?).');

    // Candidate core URLs (local → any script we see → common CDNs)
    const candidates = new Set();
    candidates.add('vendor/ffmpeg/ffmpeg-core.js');
    const scriptCore = [...document.querySelectorAll('script[src]')]
      .map(s => s.src).filter(src => /ffmpeg-core\.js(\?|$)/.test(src));
    scriptCore.forEach(u => candidates.add(u));
    candidates.add('https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js');
    candidates.add('https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js');

    // Probe cores until one responds OK
    let core = null;
    for (const url of candidates) {
      const res = await headOrGet(url); checks.push(res);
      if (res.ok) { core = res; break; }
    }
    if (!core) {
      issues.push('ffmpeg-core.js not reachable (local missing and CDNs blocked?).');
    }

    // Probe WASM next to the chosen core (or the local path if none worked)
    const wasmUrl = (core ? core.url : 'vendor/ffmpeg/ffmpeg-core.js').replace(/\.js(\?.*)?$/, '.wasm');
    const wasm = await headOrGet(wasmUrl); checks.push(wasm);
    if (!wasm.ok) {
      issues.push('ffmpeg-core.wasm not found next to ffmpeg-core.js.');
    } else if (wasm.ct && !/application\/wasm/i.test(wasm.ct)) {
      issues.push('ffmpeg-core.wasm served with wrong Content-Type (should be application/wasm).');
    }

    // Info (not fatal for UMD)
    if (!crossOriginIsolated) {
      console.info('FFmpeg note: crossOriginIsolated=false → threads/SIMD may be disabled (OK for basic usage).');
    }

    console.groupCollapsed('[FFmpeg] diagnostics');
    checks.forEach(c => console.log(c));
    console.groupEnd();

    const msg = issues.length
      ? 'FFmpeg not ready: ' + issues[0]
      : 'FFmpeg wrapper present and core/WASM look reachable.';
    show(msg, issues.length ? 'error' : 'ok');

    return { issues, checks };
  }

  // --- render capability list ---
  const caps = document.querySelector('#caps');
  if (caps) {
    caps.innerHTML = '';
    [
      ['Images & Text (built-in)', true],
      ['PDF.js (read PDF)', features.pdf],
      ['mammoth.js (read DOCX)', features.docx],
      ['SheetJS (XLSX)', features.xlsx],
      ['JSZip (PPTX/ZIP)', features.pptx],
      ['Tesseract OCR (optional)', features.ocr],
      ['jsPDF (make PDF)', features.makePdf],
      ['docx lib (make DOCX)', features.makeDocx],
      ['FFmpeg.wasm (media)', features.ffmpeg],
    ].forEach(([label, ok]) => {
      const p = document.createElement('div');
      p.className = 'cap ' + (ok ? 'ok' : 'miss');
      p.textContent = (ok ? '✓ ' : '⨯ ') + label;

      // Make the FFmpeg row actionable
      if (label.startsWith('FFmpeg.wasm')) {
        p.title = ok ? 'FFmpeg detected' : 'Click to diagnose FFmpeg';
        if (!ok) {
          p.style.cursor = 'pointer';
          p.addEventListener('click', () => diagnoseFFmpeg());
        }
      }

      caps.append(p);
    });
  }

  // If FFmpeg is missing, proactively run diagnostics once so the banner explains why.
  if (!features.ffmpeg) {
    // let the UI render first
    setTimeout(() => diagnoseFFmpeg().catch(() => { }), 0);
  }

  // Optional: expose the helper for manual use in DevTools
  window.diagnoseFFmpeg = diagnoseFFmpeg;

  return features;
}

// --- FFmpeg diagnostics (paste once) ---
async function diagnoseFFmpeg() {
  const issues = [];
  const checks = [];
  const show = (msg, kind = 'info') => (typeof showBanner === 'function' ? showBanner(msg, kind) : console[kind === 'error' ? 'error' : 'log'](msg));

  const headOrGet = async (url) => {
    try {
      let r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok && r.status === 405) r = await fetch(url, { method: 'GET', cache: 'no-store' });
      return { url, ok: r.ok, status: r.status, ct: r.headers.get('content-type') || '' };
    } catch (e) {
      return { url, ok: false, status: 0, error: (e && e.message) || String(e) };
    }
  };

  if (location.protocol === 'file:') {
    issues.push('Running over file:// — serve via http(s) so the browser can fetch WASM.');
  }

  // Wrapper presence + MIME sanity
  const wrapperSrc =
    ([...document.querySelectorAll('script[src]')].map(s => s.src).find(s => /(^|\/)ffmpeg\.js(\?|$)/.test(s)) ||
      'vendor/ffmpeg/ffmpeg.js');
  const wrap = await headOrGet(wrapperSrc); checks.push(wrap);
  const wrapperHasGlobal = !!(window.FFmpeg && window.FFmpeg.createFFmpeg);
  if (!wrap.ok) issues.push('ffmpeg.js (wrapper) not reachable.');
  if (wrap.ok && wrap.ct && !/javascript|ecmascript/i.test(wrap.ct)) {
    issues.push('ffmpeg.js served as ' + wrap.ct + ' (often an HTML fallback).');
  }
  if (wrap.ok && !wrapperHasGlobal) {
    issues.push('ffmpeg.js loaded but window.FFmpeg.createFFmpeg is missing (wrong build/CSP?).');
  }

  // Core + WASM
  const coreCandidates = [
    'vendor/ffmpeg/ffmpeg-core.js',
    ...[...document.querySelectorAll('script[src]')].map(s => s.src).filter(src => /ffmpeg-core\.js(\?|$)/.test(src)),
    `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_VER}/dist/umd/ffmpeg-core.js`,
    `https://unpkg.com/@ffmpeg/core@${FFMPEG_VER}/dist/umd/ffmpeg-core.js`,
  ];
  let core = null;
  for (const url of coreCandidates) {
    const res = await headOrGet(url); checks.push(res);
    if (res.ok) { core = res; break; }
  }
  if (!core) issues.push('ffmpeg-core.js not reachable (local missing and CDNs blocked?).');

  const wasmUrl = (core ? core.url : coreCandidates[0]).replace(/\.js(\?.*)?$/, '.wasm');
  const wasm = await headOrGet(wasmUrl); checks.push(wasm);
  if (!wasm.ok) issues.push('ffmpeg-core.wasm not found next to ffmpeg-core.js.');
  if (wasm.ok && wasm.ct && !/application\/wasm/i.test(wasm.ct)) {
    issues.push('ffmpeg-core.wasm served with wrong Content-Type; should be application/wasm.');
  }

  if (!crossOriginIsolated) {
    console.info('FFmpeg note: crossOriginIsolated=false → threads/SIMD may be disabled (OK for basic usage).');
  }

  console.groupCollapsed('[FFmpeg] diagnostics');
  checks.forEach(c => console.log(c));
  console.groupEnd();

  const msg = issues.length ? 'FFmpeg not ready: ' + issues[0] : 'FFmpeg wrapper present and core/WASM look reachable.';
  show(msg, issues.length ? 'error' : 'ok');
  return { issues, checks };
}

// expose for manual use in console
window.diagnoseFFmpeg = diagnoseFFmpeg;

function registerOutputs(index, outs, runId, target) {
  if (isStale(runId)) return;

  state.outputsByFile[index] = outs.map(o => ({
    name: o.name,
    blob: o.blob,
    url: URL.createObjectURL(o.blob)
  }));

  const card = document.getElementById('file-list')?.children[index];
  if (card) {
    const nameEl = card.querySelector('.f-name');
    const status = card.querySelector('#status-' + index);
    const pr = document.getElementById('prog-' + index);
    const badgeEl = card.querySelector('.badge');

    const newLabel = displayNameForOutputs(state.files[index], outs, target);
    if (nameEl) {
      nameEl.classList.add('clickable');
      nameEl.setAttribute('tabindex', '0');
      nameEl.setAttribute('role', 'button');
      nameEl.setAttribute('aria-disabled', 'false');
      nameEl.title = newLabel;
      nameEl.innerHTML = `<strong>${newLabel}</strong>`;
    }

    if (badgeEl) badgeEl.textContent = badgeForOutputs(outs, target);

    if (status) status.textContent = outs.length > 1 ? `Ready (${outs.length} files)` : 'Ready';
    if (pr) pr.value = 100;

    card.classList.remove('is-converting');

    // 🔧 ensure the row still fits on one line after text changes
    if (window.sizeProgress) window.sizeProgress(card);

  }
}


function createFileCard(index, file, badgeText = '', statusText = 'Queued') {
  const card = document.createElement('div');
  card.className = 'filecard is-converting';  // you can drop is-converting if not needed

  card.innerHTML = `
    <div class="file-meta">
      <div class="f-name" title="${file.name}" aria-disabled="true">
        <strong>${file.name}</strong>
      </div>
      <div class="sub">${prettySize(file.size)} • ${file.type || 'unknown'}</div>
    </div>

    <div class="file-controls">
      <div class="badge">${badgeText}</div>
      <progress class="file-progress" id="prog-${index}" max="100" value="0"></progress>
      <div class="status" id="status-${index}">${statusText}</div>
      <button type="button" class="file-remove" data-index="${index}" aria-label="Remove ${file.name}" title="Remove">×</button>
    </div>
  `;

  // remove button
  card.querySelector('.file-remove').addEventListener('click', (e) => {
    const i = +e.currentTarget.dataset.index;
    // remove from DOM
    card.remove();
    // TODO: also remove from your state if needed (state.files.splice(i,1), etc.)
  });

  return card;
}

// one-time: click on the filename downloads its outputs (when ready)
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('file-list');
  if (!list) return;
  const tagAll = (root) => {
    root.querySelectorAll('progress:not(.file-progress)').forEach(p => {
      p.classList.add('file-progress');
    });
  };
  tagAll(list);

  // observe for newly added file cards/progress bars
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;                    // elements only
        if (n.tagName === 'PROGRESS') {                  // a progress itself
          n.classList.add('file-progress');
        } else {                                         // a card subtree
          tagAll(n);
        }
      });
    }
  });
  mo.observe(list, { childList: true, subtree: true });
  // Click to download (only after conversion)
  list.addEventListener('click', (e) => {
    const nameEl = e.target.closest('.f-name');
    if (!nameEl || !nameEl.classList.contains('clickable')) return; // block pre-conversion
    const card = nameEl.closest('.filecard');
    const index = [...list.children].indexOf(card);
    if (index < 0) return;
    if (state.outputsByFile[index]?.length) downloadOutputs(index);
  });

  // Keyboard support (Enter/Space) when clickable
  list.addEventListener('keydown', (e) => {
    if (!e.target.classList?.contains('f-name')) return;
    if (!e.target.classList.contains('clickable')) return; // block pre-conversion
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const card = e.target.closest('.filecard');
      const index = [...list.children].indexOf(card);
      if (index >= 0 && state.outputsByFile[index]?.length) downloadOutputs(index);
    }
  });

  // ---- Non-blocking vendor warmups so badges flip to green on load ----
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
  idle(() => {
    const warmups = [];

    const tryWarm = (fn) => {
      try {
        const p = fn?.();
        if (p && typeof p.then === 'function') warmups.push(p.catch(() => { }));
      } catch { /* ignore */ }
    };

    // Only call if these helpers exist in your app:
    tryWarm(typeof needPdf === 'function' ? () => needPdf() : null);
    tryWarm(typeof warmFFmpegWrapper === 'function' ? () => warmFFmpegWrapper() : null);

    // (Optional) warm others too:
    // tryWarm(typeof needXLSX === 'function' ? () => needXLSX() : null);
    // tryWarm(typeof needJSZip === 'function' ? () => needJSZip() : null);
    // tryWarm(typeof needJsPDF === 'function' ? () => needJsPDF() : null);
    // tryWarm(typeof needDocx === 'function' ? () => needDocx() : null);

    Promise.allSettled(warmups).then(() => {
      try { typeof ensureVendors === 'function' && ensureVendors(); } catch { }
    });
  });
});


function downloadOutputs(index) {
  const outs = state.outputsByFile[index] || [];
  if (!outs.length) return;

  (async () => {
    for (const o of outs) {
      const a = document.createElement('a');
      a.href = o.url;
      a.download = o.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise(r => setTimeout(r, 120));
    }
  })();
}

/* ========= 4) State & element refs ========= */
const state = { files: [], outputs: [], outputsByFile: {}, budget: estimateSafeBudgetBytes(), useAuto: true, runId: 0 };

const isStale = (rid) => rid !== state.runId;


const memoryPill = $('#memory-pill'); const limitMode = $('#limit-mode'); const manualLimit = $('#manual-limit');
const targetFormat = $('#target-format'); const qualityWrap = $('#quality-wrap'); const quality = $('#quality');
const fileInput = $('#file-input'); const dropzone = $('#dropzone'); const fileList = $('#file-list'); const banner = $('#banner');
const convertBtn = $('#convert-btn'); const saveAllBtn = $('#save-all-btn'); const downloads = $('#downloads'); const downloadLinks = $('#download-links');

function refreshMemoryPill() {
  if (!memoryPill) return;               // <— guard
  const mode = state.useAuto ? 'Auto' : 'Manual';
  const mb = Math.round(state.budget / 1048576);
  memoryPill.innerHTML = `<strong>Memory:</strong> <small>${mode}</small> <span>•</span> <span>${mb} MB</span>`;
}

function showBanner(msg, tone = 'info') {
  if (!banner) return;                   // <— guard
  const color = tone === 'error' ? 'var(--danger)' : (tone === 'ok' ? 'var(--ok)' : 'var(--muted)');
  banner.innerHTML = `<span style="color:${color}">${msg}</span>`;
}

// === Dynamic targets (build from actual capabilities) ===

// order + labels reused to build <optgroup>s
const GROUPS_ORDER = ['text', 'documents', 'spreadsheets', 'images', 'media'];
const GROUP_LABELS = { text: 'Text', documents: 'Documents', spreadsheets: 'Spreadsheets', images: 'Images', media: 'Media' };

/** Map input kind -> allowed output set, based on your converters and loaded vendors */
function targetsForKind(kind) {
  const out = new Set();

  if (kind === 'image') {
    if (ENABLE_OUTPUTS.images) ['png', 'jpeg', 'webp', 'svg'].forEach(x => out.add(x));
    if (ENABLE_OUTPUTS.documents && features.makePdf) out.add('pdf'); // needs jsPDF :contentReference[oaicite:0]{index=0}
  }
  else if (kind === 'pdf') {
    if (ENABLE_OUTPUTS.images) ['png', 'jpeg', 'webp', 'svg'].forEach(x => out.add(x));                     // images from PDF :contentReference[oaicite:1]{index=1}
    ['txt', 'md', 'html', 'json', 'csv', 'jsonl', 'rtf'].forEach(x => out.add(x));                              // text-ish from PDF :contentReference[oaicite:2]{index=2}
    if (ENABLE_OUTPUTS.documents && features.makeDocx) out.add('docx');                                 // PDF → DOCX when docx lib present :contentReference[oaicite:3]{index=3}
  }
  else if (kind === 'docx') {
    if (ENABLE_OUTPUTS.images) ['png', 'jpeg', 'webp', 'svg'].forEach(x => out.add(x));                      // DOCX → images :contentReference[oaicite:4]{index=4}
    ['txt', 'md', 'html', 'json'].forEach(x => out.add(x));                                                  // DOCX → text-ish :contentReference[oaicite:5]{index=5}
    if (ENABLE_OUTPUTS.documents && features.makePdf) out.add('pdf');                                   // DOCX → PDF needs jsPDF :contentReference[oaicite:6]{index=6}
  }
  else if (kind === 'pptx') {
    if (ENABLE_OUTPUTS.images) ['png', 'jpeg', 'webp', 'svg'].forEach(x => out.add(x));                      // PPTX → per-slide images :contentReference[oaicite:7]{index=7}
    ['txt', 'md', 'html', 'json'].forEach(x => out.add(x));                                                  // PPTX → text-ish :contentReference[oaicite:8]{index=8}
    if (ENABLE_OUTPUTS.documents && features.makePdf) out.add('pdf');                                   // PPTX → PDF needs jsPDF :contentReference[oaicite:9]{index=9}
    if (ENABLE_OUTPUTS.documents && features.makeDocx) out.add('docx');                                 // PPTX → DOCX needs docx lib :contentReference[oaicite:10]{index=10}
  }
  else if (kind === 'xlsx') {
    ['csv', 'json', 'html', 'xlsx'].forEach(x => out.add(x));                                                // XLSX outputs :contentReference[oaicite:11]{index=11}
  }
  else if (kind === 'csv') {
    ['xlsx', 'json', 'html', 'txt', 'md', 'csv'].forEach(x => out.add(x));                                     // CSV outputs :contentReference[oaicite:12]{index=12}
  }
  else if (kind === 'text') {
    ['txt', 'md', 'html', 'csv', 'json', 'jsonl', 'rtf'].forEach(x => out.add(x));                              // text-ish set (see PDF/DOCX branches) :contentReference[oaicite:13]{index=13}
    if (ENABLE_OUTPUTS.images) ['png', 'jpeg', 'webp', 'svg'].forEach(x => out.add(x));                      // uses textToImageBlobs :contentReference[oaicite:14]{index=14}
    if (ENABLE_OUTPUTS.documents && features.makePdf) out.add('pdf');                                   // via textishToPdf :contentReference[oaicite:15]{index=15}
    if (ENABLE_OUTPUTS.documents && features.makeDocx) out.add('docx');                                 // via textishToDocx :contentReference[oaicite:16]{index=16}
  }
  else if (kind === 'audio') {
    if (features.ffmpeg && ENABLE_OUTPUTS.media) ['mp3', 'wav', 'ogg', 'm4a', 'mp4', 'webm'].forEach(x => out.add(x)); // media targets (audio set + webm) :contentReference[oaicite:17]{index=17}
  }
  else if (kind === 'video') {
    if (features.ffmpeg && ENABLE_OUTPUTS.media) ['mp4', 'webm', 'gif', 'mp3', 'wav', 'ogg', 'm4a'].forEach(x => out.add(x)); // video + extract audio :contentReference[oaicite:18]{index=18}
  }
  return out;
}

/** Intersection across all selected files */
function possibleTargetsForFiles(files) {
  if (!files.length) return new Set();
  let acc = null;
  for (const f of files) {
    const kind = detectKind(f); // your existing detector :contentReference[oaicite:19]{index=19}
    const set = targetsForKind(kind);
    acc = acc ? new Set([...acc].filter(x => set.has(x))) : set;
  }
  return acc || new Set();
}

function rebuildTargetDropdown(allowedSet) {
  targetFormat.innerHTML = '';
  if (!allowedSet || allowedSet.size === 0) {
    targetFormat.disabled = true;
    qualityWrap.style.display = 'none';
    return;
  }
  targetFormat.disabled = false;

  for (const group of GROUPS_ORDER) {
    const items = (TARGET_GROUPS[group] || []).filter(([val]) => allowedSet.has(val));
    if (!items.length) continue;
    const og = document.createElement('optgroup'); og.label = GROUP_LABELS[group];
    for (const [val, label] of items) {
      const o = document.createElement('option'); o.value = val; o.textContent = label;
      og.appendChild(o);
    }
    targetFormat.appendChild(og);
  }

  // keep previous selection if still valid, else pick the first
  const keep = allowedSet.has(targetFormat.value) ? targetFormat.value : (targetFormat.querySelector('option')?.value || '');
  if (keep) targetFormat.value = keep;

  qualityWrap.style.display = (targetFormat.value === 'jpeg' || targetFormat.value === 'webp') ? '' : 'none';
}

function refreshTargetDropdown() {
  const allowed = possibleTargetsForFiles(state.files);
  rebuildTargetDropdown(allowed);
  if (allowed.size === 0 && state.files.length) {
    showBanner('No common output for the selected files.', 'error');
  }
}

// Remove one file by index
function removeFileAt(index) {
  if (!Array.isArray(state.files)) return;
  if (index < 0 || index >= state.files.length) return;
  const f = state.files.splice(index, 1)[0];
  renderFileList();
  if (typeof refreshTargetDropdown === 'function') refreshTargetDropdown();
  if (typeof showBanner === 'function') {
    const name = f?.name || f?.file?.name || `file #${index + 1}`;
    showBanner(`Removed ${name}.`, 'ok');
  }
  if (state.files.length === 0) {
    try { downloads.hidden = true; downloadLinks.innerHTML = ''; } catch { }
  }
}
// Find the list container (adjust selector if yours differs)
function getFileListEl() {
  return document.querySelector('#file-list, #files, [data-role="file-list"]');
}
/* ========= 5) Build target dropdown ========= */
/* ========= 5) Build target dropdown ========= */
function buildTargets() {
  if (!targetFormat || !qualityWrap) return; // guard if DOM not ready

  const groupsOrder = ['text', 'documents', 'spreadsheets', 'images', 'media'];
  const labels = { text: 'Text', documents: 'Documents', spreadsheets: 'Spreadsheets', images: 'Images', media: 'Media' };

  targetFormat.innerHTML = '';
  for (const key of groupsOrder) {
    if (!ENABLE_OUTPUTS[key]) continue;
    const items = TARGET_GROUPS[key]; if (!items) continue;
    const og = document.createElement('optgroup'); og.label = labels[key];
    items.forEach(([val, label]) => {
      const o = document.createElement('option'); o.value = val; o.textContent = label; og.appendChild(o);
    });
    targetFormat.appendChild(og);
  }
  if (ENABLE_OUTPUTS.images && [...targetFormat.querySelectorAll('option')].some(o => o.value === 'jpeg')) {
    targetFormat.value = 'jpeg';
  }
  qualityWrap.style.display = (targetFormat.value === 'jpeg' || targetFormat.value === 'webp') ? '' : 'none';
}

// Call it once the DOM is ready (works with or without <script defer>)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildTargets);
} else {
  buildTargets();
}


refreshMemoryPill();

/* Create a single promise and await it before converting */
const vendorsReady = ensureVendors();

/* ========= 6) File I/O & UI events ========= */
dropzone.addEventListener('dragenter', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));
$('#clear-btn').addEventListener('click', () => {
  state.files = []; state.outputs = [];
  renderFileList();
  if (typeof refreshTargetDropdown === 'function') refreshTargetDropdown();   // <-- add this
  downloadLinks.innerHTML = ''; downloads.hidden = true; fileInput.value = '';
  showBanner('Cleared.');
});


limitMode.addEventListener('change', () => { const isManual = limitMode.value === 'manual'; state.useAuto = !isManual; manualLimit.disabled = !isManual; state.budget = isManual ? Math.max(10, +manualLimit.value) * 1048576 : estimateSafeBudgetBytes(); refreshMemoryPill(); });
manualLimit.addEventListener('input', () => { state.budget = Math.max(10, +manualLimit.value) * 1048576; refreshMemoryPill(); });

targetFormat.addEventListener('change', () => {
  const v = targetFormat.value;
  qualityWrap.style.display = (v === 'jpeg' || v === 'webp') ? '' : 'none';
});

$('#theme-btn')?.addEventListener('click', () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'light' ? '' : 'light'; });
$('#share-btn')?.addEventListener('click', async () => { try { if (navigator.share) { await navigator.share({ title: document.title, url: location.href }); } else { await navigator.clipboard.writeText(location.href); showBanner('Link copied to clipboard.', 'ok'); } } catch { } });

function addFiles(files) {
  if (!files?.length) return;
  const totalAdded = files.reduce((s, f) => s + f.size, 0);
  const current = state.files.reduce((s, f) => s + f.size, 0);
  if (current + totalAdded > state.budget) showBanner(`Too much data at once (${fmtBytes(current + totalAdded)}). Budget ${fmtBytes(state.budget)}.`, 'error');
  state.files.push(...files);
  renderFileList();
  if (typeof refreshTargetDropdown === 'function') refreshTargetDropdown();   // <-- add this line
  showBanner(`Added ${files.length} file(s). Total: ${state.files.length}.`);
}


function detectKind(file) {
  const n = file.name.toLowerCase();
  const t = (file.type || '').toLowerCase();

  if (t.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/.test(n)) return 'image';
  if (/\.docx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (/\.pptx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (/\.pdf$/.test(n) || t === 'application/pdf') return 'pdf';
  if (/\.xlsx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (/\.csv$/.test(n) || t === 'text/csv') return 'csv';
  if (t.startsWith('text/') || ['application/json', 'text/html', 'text/markdown'].includes(t) || /\.(txt|md|json|html)$/.test(n)) return 'text';

  // NEW: audio & video
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/.test(n)) return 'audio';
  if (t.startsWith('video/') || /\.(mp4|webm|ogg|ogv|mov|mkv|avi|m4v)$/.test(n)) return 'video';

  return 'unknown';
}

function renderFileList() {
  fileList.innerHTML = '';
  if (!state.files.length) {
    fileList.innerHTML = '<div class="hint" style="padding:12px 0">No files yet.</div>';
    return;
  }

  state.files.forEach((f, i) => {
    const card = el('div', 'filecard');

    // Left: filename + meta
    const meta = el('div', 'file-meta');
    meta.innerHTML =
      `<div class="f-name" title="${f.name}" aria-disabled="true"><strong>${f.name}</strong></div>
       <div class="sub">${fmtBytes(f.size)} • ${f.type || 'unknown'}</div>`;

    // Right controls (grouped): badge + progress + status
    const ctrls = el('div', 'file-controls');

    const badge = el('div', 'badge');
    badge.textContent = detectKind(f);

    const prog = document.createElement('progress');
    prog.max = 100;
    prog.value = 0;
    prog.id = 'prog-' + i;

    const status = el('div', 'status');
    status.id = 'status-' + i;
    status.textContent = 'Queued';

    // NEW: remove button INSIDE .file-controls
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'file-remove';
    rm.dataset.index = i;
    rm.setAttribute('aria-label', `Remove ${f.name}`);
    rm.title = 'Remove';
    rm.textContent = '×';

    ctrls.append(badge, prog, status, rm);

    // keep your original structure
    card.append(meta, ctrls);
    fileList.append(card);
  });
}

// one-time: event delegation for the ✕ button
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.file-remove');
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  removeFileAt(idx);
});



/* ========= 7) Conversion dispatcher (mixed batch supported) ========= */
async function convertFile(file, target, index) {
  const kind = detectKind(file);
  if (kind === 'image') return convertImageFile(file, target);
  if (kind === 'pdf') return convertPdfFile(file, target);
  if (kind === 'docx') return convertDocxFile(file, target);
  if (kind === 'pptx') return convertPptxFile(file, target);
  if (kind === 'xlsx' || kind === 'csv') return convertSheetFile(file, target);
  if (kind === 'text') return convertTextFile(file, target);
  if (kind === 'audio' || kind === 'video') return convertMediaFile(file, target, kind, index);
  throw new Error('Unsupported file type');
}

function wireFFmpegProgress(ff, index) {
  const handler = ({ ratio, progress }) => {
    const p = Math.max(0, Math.min(100, Math.round(((ratio ?? progress) || 0) * 100)));
    const progEl = document.getElementById('prog-' + index);
    const statusEl = document.getElementById('status-' + index);
    if (progEl) progEl.value = p;
    if (statusEl) statusEl.textContent = p >= 100 ? 'Finishing…' : `Converting… ${p}%`;
  };
  if (typeof ff.setProgress === 'function') ff.setProgress(handler);
  else if (typeof ff.on === 'function') { try { ff.off?.('progress', ff._progressHandler); } catch { } ff._progressHandler = handler; ff.on('progress', handler); }
}


// Local-only: ensure the UMD wrapper is present (no CDN)
async function ensureFFmpegWrapperLocal() {
  if (window.FFmpeg?.createFFmpeg) return true;
  const BASE = 'vendor/ffmpeg/';
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = BASE + 'ffmpeg.js';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load local ' + s.src));
    document.head.appendChild(s);
  });
  return !!(window.FFmpeg && window.FFmpeg.createFFmpeg);
}

// Warm only the wrapper (no WASM yet), locally
// Warm only the local wrapper (no WASM yet), *local only*
async function warmFFmpegWrapper() {
  console.log('warmFFmpegWrapper: start');
  try {
    const ok = await ensureFFmpegGlobal();
    if (ok) { features.ffmpeg = true; typeof ensureVendors === 'function' && ensureVendors(); }
  } catch { }
}


// Kick off warm-up once
warmFFmpegWrapper();

// Exec shim: accepts (...args) or an array; uses exec() if present, else run()
async function ffExec(ff, ...args) {
  // allow ffExec(ff, ['-i','in','out']) and ffExec(ff, '-i','in','out')
  const argv = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  if (typeof ff.exec === 'function') return ff.exec(argv);
  return ff.run(...argv);
}

/* ---- Text → many ---- */
// Media (audio/video) → audio/video/gif — MT when possible, ST otherwise

// Drop-in: replaces your entire convertMediaFile(...)
async function convertMediaFile(file, target, kind, index) {
  // Status: Preparing…
  try {
    const s = document.getElementById('status-' + index);
    if (s) s.textContent = 'Preparing…';
    const p = document.getElementById('prog-' + index);
    if (p && typeof p.value === 'number') p.value = 0;
  } catch { }

  const ff = await needFFmpeg();

  // Per-row progress (clamped & robust for both 0.12 'progress' and legacy 'ratio')
  const update = ({ ratio, progress } = {}) => {
    let val = Number.isFinite(progress) ? progress
      : Number.isFinite(ratio) ? ratio
        : 0;
    if (!Number.isFinite(val)) val = 0;
    if (val < 0) val = 0;
    if (val > 1) val = 1;

    const pct = Math.round(val * 100);
    const pr = document.getElementById('prog-' + index);
    const st = document.getElementById('status-' + index);
    if (pr) pr.value = pct;
    if (st) st.textContent = pct >= 100 ? 'Finishing…' : `Converting… ${pct}%`;
  };
  if (typeof ff.setProgress === 'function') ff.setProgress(update);
  else if (typeof ff.on === 'function') {
    try { ff.off?.('progress', ff._rowHandlers?.[index]); } catch { }
    (ff._rowHandlers ||= {});
    ff._rowHandlers[index] = update;
    ff.on('progress', update);
  }

  // Basic validation
  const audioTargets = new Set(['mp3', 'wav', 'ogg', 'm4a']);
  const videoTargets = new Set(['mp4', 'webm', 'gif']);
  const isAudioIn = kind === 'audio';
  const isVideoIn = kind === 'video';
  if (isAudioIn && !audioTargets.has(target)) throw new Error('Audio → ' + target.toUpperCase() + ' not supported');
  if (isVideoIn && !(videoTargets.has(target) || audioTargets.has(target))) throw new Error('Video → ' + target.toUpperCase() + ' not supported');
  if (target === 'gif' && !isVideoIn) throw new Error('GIF is only from video input');

  // --- IO helpers (fixed) ---
  // pick a safe fetchFile that returns ArrayBuffer/Uint8Array; DO NOT call it yet
  const fetchFileFn =
    window.FFmpeg?.fetchFile ||
    window.fetchFile ||
    ((blob) => blob.arrayBuffer());

  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new Error('Input file is missing or not a Blob/File.');
  }

  const inExt = (file.name?.match(/\.([^.]+)$/)?.[1] || (isAudioIn ? 'audio' : 'video')).toLowerCase();
  const inName = `in.${inExt}`;
  const outName = `out.${target}`;

  // Write input (prefer new API; fallback to FS)
  const data = await fetchFileFn(file);            // ArrayBuffer or Uint8Array
  const inputU8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof ff.writeFile === 'function') {
    await ff.writeFile(inName, inputU8);
  } else {
    ff.FS('writeFile', inName, inputU8);
  }

  // Build args
  let args = ['-i', inName];
  if (audioTargets.has(target)) {
    args.push('-vn');
    if (target === 'mp3') args.push('-c:a', 'libmp3lame', '-b:a', '192k');
    if (target === 'wav') args.push('-c:a', 'pcm_s16le', '-ar', '44100');
    if (target === 'ogg') args.push('-c:a', 'libvorbis', '-q:a', '5');
    if (target === 'm4a') args.push('-c:a', 'aac', '-b:a', '192k');
    args.push(outName);
  } else {
    if (target === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-row-mt', '1');
      args.push('-c:a', 'libopus', '-b:a', '128k');
    } else if (target === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p');
      args.push('-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart');
    } else if (target === 'gif') {
      args.push('-t', '10', '-vf', 'fps=12,scale=480:-1:flags=lanczos');
    }
    args.push(outName);
  }

  // Run (uses exec() on 0.12+, run() on older via your shim)
  await ffExec(ff, args);

  // Read output (prefer new API; fallback to FS)
  const outBytes = (typeof ff.readFile === 'function')
    ? await ff.readFile(outName)
    : ff.FS('readFile', outName);

  const mime =
    target === 'mp3' ? 'audio/mpeg' :
      target === 'wav' ? 'audio/wav' :
        target === 'ogg' ? 'audio/ogg' :
          target === 'm4a' ? 'audio/mp4' :
            target === 'webm' ? 'video/webm' :
              target === 'mp4' ? 'video/mp4' :
                target === 'gif' ? 'image/gif' : 'application/octet-stream';

  // Cleanup (best effort)
  try { typeof ff.unlink === 'function' ? await ff.unlink(inName) : ff.FS('unlink', inName); } catch { }
  try { typeof ff.unlink === 'function' ? await ff.unlink(outName) : ff.FS('unlink', outName); } catch { }

  const blob = new Blob([outBytes], { type: mime });
  return [{ blob, name: (file.name.replace(/\.[^.]+$/, '') || 'output') + '.' + target }];
}







// Load only the FFmpeg UMD wrapper so the badge can turn green early.
// Load only the wrapper so the badge flips green early (no WASM yet)
// Loads just the wrapper so the badge can turn green early (no WASM yet)
async function warmFFmpegWrapper() {
  if (_warmFFmpegOnce) return _warmFFmpegOnce;
  _warmFFmpegOnce = (async () => {
    console.log('warmFFmpegWrapper: start');

    // Already there?
    if (await ensureFFmpegGlobal()) { features.ffmpeg = true; ensureVendors?.(); return; }

    // Try local UMDs we see in your tree
    const localWrappers = [
      'vendor/ffmpeg/ffmpeg.js',
      'vendor/ffmpeg/ffmpeg.min.js'
    ];

    for (const src of localWrappers) {
      const h = await headOrGet(src);
      if (!h.ok) continue;                            // not present
      if (!/javascript|ecmascript/i.test(h.ct)) {     // SPA fallback
        await diagnoseWrapper(src, 'Wrapper URL returns non-JS.');
        continue;
      }
      try {
        await loadClassicScript(src);
        if (await ensureFFmpegGlobal()) {
          features.ffmpeg = true; ensureVendors?.();
          return;
        }
        await diagnoseWrapper(src, 'ffmpeg.js loaded but window/global FFmpeg did not appear (not a UMD build?).');
      } catch (e) {
        show('Failed to execute local ffmpeg.js', 'error');
      }
    }

    // CDN UMD fallback
    const cdn = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VER}/dist/umd/ffmpeg.js`;
    try {
      await loadClassicScript(cdn);
      if (await ensureFFmpegGlobal()) {
        features.ffmpeg = true; ensureVendors?.();
        return;
      }
      await diagnoseWrapper(cdn, 'CDN ffmpeg.js loaded but did not expose createFFmpeg (CSP/isolated environment?).');
    } catch {
      show('Could not load FFmpeg wrapper from CDN.', 'error');
    }

    // final attempt via ESM was already tried in ensureFFmpegGlobal()
    features.ffmpeg = !!adoptFFmpegGlobal();
    ensureVendors?.();
  })();
  return _warmFFmpegOnce;
}






// Kick it off right away so the badge goes green soon after load
warmFFmpegWrapper().catch(() => { });






/* ---- PPTX → textish / images-per-slide ---- */
async function convertPptxFile(file, target) {
  if (!features.pptx) throw new Error('PPTX reading needs JSZip');
  const ab = await file.arrayBuffer(); const zip = await JSZip.loadAsync(ab);
  const slideFiles = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/slide(\d+)\.xml/)[1]) - Number(b.match(/slide(\d+)\.xml/)[1]));
  const slides = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.file(slideFiles[i]).async('string');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const text = Array.from(dom.getElementsByTagNameNS('*', 't')).map(n => n.textContent.trim()).filter(Boolean).join('\n');
    slides.push({ i: i + 1, text });
  }
  if (['png', 'jpeg', 'webp', 'svg'].includes(target)) {
    if (!ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled.');
    const outs = [];
    for (const s of slides) {
      const [img] = await textToImageBlobs(`Slide ${s.i}\n\n${s.text}`, target, `${baseName(file.name)}_slide${s.i}`);
      outs.push(img);
    }
    if (outs.length === 1) return [outs[0]];
    if (!window.JSZip) return outs;
    const zipOut = new JSZip(); outs.forEach(o => zipOut.file(o.name, o.blob));
    const blob = await zipOut.generateAsync({ type: 'blob' });
    return [{ blob, name: `${baseName(file.name)}_${target}_slides.zip` }];
  }
  const joined = slides.map(s => `[Slide ${s.i}]\n${s.text}`).join('\n\n');
  if (target === 'txt') return [{ blob: new Blob([joined], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }];
  if (target === 'md') return [{ blob: new Blob([joined], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }];
  if (target === 'html') return [{ blob: new Blob([`<!doctype html><meta charset="utf-8"><pre>${escapeHtml(joined)}</pre>`], { type: 'text/html' }), name: swapExt(file.name, 'html') }];
  if (target === 'json') return [{ blob: new Blob([JSON.stringify({ slides }, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }];
  if (target === 'pdf') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makePdf) throw new Error('PDF output needs jsPDF'); return textishToPdf(joined, file.name); }
  if (target === 'docx') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makeDocx) throw new Error('DOCX output needs docx.min.js'); return textishToDocx(joined, file.name); }
  throw new Error('PPTX → ' + target.toUpperCase() + ' not supported');
}

/* ---- PDF → images/text ---- */
// Drop-in replacement
async function convertPdfFile(file, target) {
  // Ensure PDF.js is loaded (local vendor first, then CDN fallback)
  // Robust loader: supports UMD (.js) or ESM (.mjs), local first then CDN
  async function ensurePdf() {
    if (window.pdfjsLib?.getDocument) return;

    const loadScript = (src) =>
      new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = res;
        s.onerror = () => rej(new Error("Failed to load " + src));
        document.head.appendChild(s);
      });

    // Try local UMD → CDN UMD → local ESM → CDN ESM
    const tryOrder = [
      () => loadScript("vendor/pdf.min.js"),
      () => loadScript("https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.min.js"),
      async () => {
        const mod = await import("vendor/pdf.min.mjs");
        window.pdfjsLib = mod; // expose to rest of app
      },
      async () => {
        const mod = await import("https://unpkg.com/pdfjs-dist@4/build/pdf.min.mjs");
        window.pdfjsLib = mod;
      },
    ];

    let loaded = false;
    for (const step of tryOrder) {
      try { await step(); loaded = true; break; } catch { }
    }
    if (!loaded || !window.pdfjsLib?.getDocument) {
      throw new Error("Unable to load PDF.js");
    }

    // Worker: prefer local .js, then local .mjs, then CDN UMD, then CDN ESM
    const workerCandidates = [
      "vendor/pdf.worker.min.js",
      "vendor/pdf.worker.min.mjs",
      "https://unpkg.com/pdfjs-dist@4/legacy/build/pdf.worker.min.js",
      "https://unpkg.com/pdfjs-dist@4/build/pdf.worker.min.mjs",
    ];

    // Pick the first that exists; fall back to first if HEAD fails (file://)
    let workerSrc = workerCandidates[0];
    for (const url of workerCandidates) {
      try {
        const ok = await fetch(url, { method: "HEAD", cache: "no-store" }).then(r => r.ok);
        if (ok) { workerSrc = url; break; }
      } catch { /* ignore; e.g., file:// */ }
    }

    if (window.pdfjsLib?.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
    }

    // Flip capability badge
    if (typeof features === "object") features.pdf = !!window.pdfjsLib;
    try { typeof ensureVendors === "function" && ensureVendors(); } catch { }
  }



  await ensurePdf();
  if (!window.pdfjsLib?.getDocument) throw new Error("PDF support needs PDF.js");

  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const count = pdf.numPages;

  // Image outputs
  if (["png", "jpeg", "webp", "svg"].includes(target)) {
    if (!ENABLE_OUTPUTS.images) throw new Error("Image outputs disabled.");
    const pages = [];
    const mime =
      target === "png" ? "image/png" : target === "jpeg" ? "image/jpeg" : "image/webp";

    for (let p = 1; p <= count; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      if (target === "svg") {
        const dataUrl = canvas.toDataURL("image/png");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="100%" height="100%"/></svg>`;
        pages.push({
          blob: new Blob([svg], { type: "image/svg+xml" }),
          name: `${baseName(file.name)}_p${p}.svg`,
        });
      } else {
        const q =
          target === "png" ? undefined : Number((typeof quality !== "undefined" && quality?.value) || 0.92);
        const blob = await new Promise((res) => canvas.toBlob(res, mime, q));
        pages.push({ blob, name: `${baseName(file.name)}_p${p}.${target}` });
      }
    }

    if (pages.length === 1) return [pages[0]];
    if (!window.JSZip) return pages;

    const zip = new JSZip();
    pages.forEach((p) => zip.file(p.name, p.blob));
    const zipBlob = await zip.generateAsync({ type: "blob" });
    return [{ blob: zipBlob, name: `${baseName(file.name)}_${target}_images.zip` }];
  }

  // Text-ish targets
  let all = "";
  for (let p = 1; p <= count; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    all += (p > 1 ? "\n\n" : "") + tc.items.map((it) => it.str).join(" ");
  }

  if (target === "md")
    return [{ blob: new Blob([all], { type: "text/markdown" }), name: swapExt(file.name, "md") }];

  if (target === "html")
    return [
      {
        blob: new Blob(
          [`<!doctype html><meta charset="utf-8"><pre style="white-space:pre-wrap">${escapeHtml(all)}</pre>`],
          { type: "text/html" }
        ),
        name: swapExt(file.name, "html"),
      },
    ];

  if (target === "json")
    return [
      {
        blob: new Blob([JSON.stringify({ text: all }, null, 2)], { type: "application/json" }),
        name: swapExt(file.name, "json"),
      },
    ];

  if (target === "csv")
    return [
      {
        blob: new Blob(
          [all.split("\n").map((l) => '"' + l.replaceAll('"', '""') + '"').join("\n")],
          { type: "text/csv" }
        ),
        name: swapExt(file.name, "csv"),
      },
    ];

  if (target === "jsonl")
    return [
      {
        blob: new Blob(
          [all.split("\n").map((l) => (l ? JSON.stringify({ line: l }) : "{}")).join("\n")],
          { type: "application/jsonl" }
        ),
        name: swapExt(file.name, "jsonl"),
      },
    ];

  if (target === "rtf")
    return [
      {
        blob: new Blob([`{\\rtf1\\ansi\n${escapeHtml(all).replace(/\n/g, "\\par\n")}}`], {
          type: "application/rtf",
        }),
        name: swapExt(file.name, "rtf"),
      },
    ];

  if (target === "docx") {
    if (!ENABLE_OUTPUTS.documents) throw new Error("Document outputs disabled.");
    if (!features.makeDocx) throw new Error("DOCX output needs docx.min.js");
    return textishToDocx(all, file.name);
  }

  if (target === "pdf") return [{ blob: file, name: file.name }];

  return [{ blob: new Blob([all], { type: "text/plain" }), name: swapExt(file.name, "txt") }];
}


/* ---- CSV/XLSX ⇄ ---- */
async function convertSheetFile(file, target) {
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  if (isCSV) {
    const text = await file.text();
    if (target === 'xlsx') { if (!ENABLE_OUTPUTS.spreadsheets) throw new Error('Spreadsheet outputs disabled.'); if (!features.xlsx) throw new Error('CSV→XLSX needs SheetJS'); const wb = XLSX.read(text, { type: 'string' }); const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return [{ blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: swapExt(file.name, 'xlsx') }]; }
    if (target === 'json') { const wb = XLSX.read(text, { type: 'string' }); const ws = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(ws, { defval: null }); return [{ blob: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; }
    if (target === 'html') { const wb = XLSX.read(text, { type: 'string' }); const ws = wb.Sheets[wb.SheetNames[0]]; const html = XLSX.utils.sheet_to_html(ws); return [{ blob: new Blob([html], { type: 'text/html' }), name: swapExt(file.name, 'html') }]; }
    if (['txt', 'md', 'csv'].includes(target)) { if (target === 'csv') return [{ blob: new Blob([text], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }]; if (target === 'txt') return [{ blob: new Blob([text], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }]; if (target === 'md') return [{ blob: new Blob([text], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }]; }
    throw new Error('CSV → ' + target.toUpperCase() + ' not supported');
  }
  // XLSX
  if (!features.xlsx) throw new Error('XLSX support needs SheetJS');
  if (!['csv', 'json', 'html', 'xlsx'].includes(target)) throw new Error('XLSX → ' + target.toUpperCase() + ' not supported');
  const ab = await file.arrayBuffer(); const wb = XLSX.read(ab, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]];
  if (target === 'csv') { const csv = XLSX.utils.sheet_to_csv(ws); return [{ blob: new Blob([csv], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }]; }
  if (target === 'json') { const json = XLSX.utils.sheet_to_json(ws, { defval: null }); return [{ blob: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; }
  if (target === 'html') { const html = XLSX.utils.sheet_to_html(ws); return [{ blob: new Blob([html], { type: 'text/html' }), name: swapExt(file.name, 'html') }]; }
  if (target === 'xlsx') { const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return [{ blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: swapExt(file.name, 'xlsx') }]; }
}

/* ---- Images ⇄ Images / SVG / PDF ---- */
async function convertImageFile(file, target) {
  if (!['png', 'jpeg', 'webp', 'svg', 'pdf'].includes(target)) {
    throw new Error('Image → ' + target.toUpperCase() + ' supports PNG/JPEG/WebP/SVG/PDF');
  }
  if (target === 'pdf') {
    if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.');
    if (!features.makePdf) throw new Error('PDF output needs jsPDF');
    const bitmap = await createImageBitmap(file);
    const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; c.getContext('2d').drawImage(bitmap, 0, 0);
    return imageToPdf(c, file.name);
  }
  if (!ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
  if (target === 'svg') {
    const dataUrl = canvas.toDataURL('image/png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="100%" height="100%"/></svg>`;
    return [{ blob: new Blob([svg], { type: 'image/svg+xml' }), name: swapExt(file.name, 'svg') }];
  }
  const q = Number(quality.value || 0.92); const mime = target === 'png' ? 'image/png' : (target === 'jpeg' ? 'image/jpeg' : 'image/webp');
  const blob = await new Promise(res => canvas.toBlob(res, mime, target === 'png' ? undefined : q));
  return [{ blob, name: swapExt(file.name, target) }];
}

/* ---- Render text to image (used by DOCX/TXT/PPTX → JPEG/PNG/WebP/SVG) ---- */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth) { if (line) lines.push(line); line = w; } else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}
function drawTextToCanvas(text, { width = 1200, padding = 40, lineHeight = 28, font = '16px Arial' } = {}) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = font;
  const maxWidth = width - padding * 2;
  const paragraphs = text.split(/\n{2,}/);
  let lines = [];
  paragraphs.forEach(p => {
    const pLines = wrapText(ctx, p.replace(/\n/g, ' '), maxWidth);
    lines.push(...pLines, ''); // blank line
  });
  if (lines[lines.length - 1] === '') lines.pop();
  const height = padding * 2 + Math.max(lineHeight * lines.length, lineHeight * 2);
  c.width = width; c.height = height;
  // bg + text
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111'; ctx.font = font;
  let y = padding + lineHeight;
  for (const ln of lines) { ctx.fillText(ln, padding, y); y += lineHeight; }
  return c;
}
async function textToImageBlobs(text, target, base) {
  if (target === 'svg') {
    const c = drawTextToCanvas(text, {});
    const dataUrl = c.toDataURL('image/png');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}"><image href="${dataUrl}" width="100%" height="100%"/></svg>`;
    return [{ blob: new Blob([svg], { type: 'image/svg+xml' }), name: `${base}.svg` }];
  }
  const c = drawTextToCanvas(text, {});
  const mime = target === 'png' ? 'image/png' : (target === 'jpeg' ? 'image/jpeg' : 'image/webp');
  const q = target === 'png' ? undefined : Number(quality.value || 0.92);
  const blob = await new Promise(res => c.toBlob(res, mime, q));
  return [{ blob, name: `${base}.${target}` }];
}
// --- helpers to derive display name / badge from outputs ---
function extFromName(n) {
  const m = String(n).toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/);
  return m ? m[1] : '';
}
function displayNameForOutputs(origFile, outs, target) {
  // If we produced exactly one file (incl. a .zip), show its exact name.
  if (outs.length === 1) return outs[0].name;
  // Otherwise show the conceptual name (base + target ext) — status already shows "(N files)"
  return (origFile && target) ? (origFile.name.replace(/\.[^.]+$/, '') + '.' + target) : (outs[0]?.name || origFile?.name);
}
function badgeForOutputs(outs, target) {
  if (outs.length === 1) return extFromName(outs[0].name) || (target || '').toLowerCase();
  return (target || 'multi').toLowerCase();
}

/* ---- Textish → PDF/DOCX ---- */
async function textishToPdf(text, filename) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('jsPDF missing');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 40, lh = 16, pageW = 595 - 2 * margin, pageH = 842 - 2 * margin;
  const lines = doc.splitTextToSize(text, pageW);
  let y = margin;
  for (const line of lines) { if (y > pageH) { doc.addPage(); y = margin; } doc.text(line, margin, y); y += lh; }
  const blob = doc.output('blob');
  return [{ blob, name: swapExt(filename, 'pdf') }];
}
async function imageToPdf(canvas, filename) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('jsPDF missing');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const maxW = 500, maxH = 760;
  const r = Math.min(maxW / canvas.width, maxH / canvas.height, 1);
  const w = canvas.width * r, h = canvas.height * r;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  doc.addImage(dataUrl, 'JPEG', (595 - w) / 2, (842 - h) / 2, w, h);
  const blob = doc.output('blob');
  return [{ blob, name: swapExt(filename, 'pdf') }];
}
async function textishToDocx(text, filename) {
  if (!window.docx) throw new Error('docx lib missing');
  const { Document, Packer, Paragraph } = window.docx;
  const paras = text.split(/\r?\n/).map(t => new Paragraph(t));
  const doc = new Document({ sections: [{ properties: {}, children: paras }] });
  const blob = await Packer.toBlob(doc);
  return [{ blob, name: swapExt(filename, 'docx') }];
}

/* ---- Simple HTML→MD & strip ---- */
function stripHtml(html) { const d = document.createElement('div'); d.innerHTML = html; return d.textContent || d.innerText || ''; }
function htmlToMarkdown(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  d.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { const lvl = +h.tagName[1]; h.outerHTML = '\n' + ('#'.repeat(lvl)) + ' ' + h.textContent + '\n'; });
  d.querySelectorAll('strong,b').forEach(n => { n.outerHTML = '**' + n.textContent + '**'; });
  d.querySelectorAll('em,i').forEach(n => { n.outerHTML = '*' + n.textContent + '*'; });
  d.querySelectorAll('a').forEach(a => { const href = a.getAttribute('href') || ''; a.outerHTML = '[' + a.textContent + '](' + href + ')'; });
  d.querySelectorAll('br').forEach(br => { br.outerHTML = '\n'; });
  d.querySelectorAll('p').forEach(p => { p.outerHTML = '\n' + p.textContent + '\n'; });
  d.querySelectorAll('ul').forEach(ul => { const lines = [...ul.querySelectorAll('li')].map(li => ' - ' + li.textContent).join('\n'); ul.outerHTML = '\n' + lines + '\n'; });
  d.querySelectorAll('ol').forEach((ol) => { const lines = [...ol.querySelectorAll('li')].map((li, i) => ` ${i + 1}. ${li.textContent}`).join('\n'); ol.outerHTML = '\n' + lines + '\n'; });
  return stripHtml(d.innerHTML).replace(/\n{3,}/g, '\n\n');
}

/* ========= 8) Orchestration ========= */
convertBtn.addEventListener('click', async () => {
  await vendorsReady;

  if (!state.files.length) { showBanner('Add some files first.', 'error'); return; }

  // 🔁 CANCEL previous run + RESET counters/UI
  state.runId += 1;
  const runId = state.runId;

  state.outputs = [];
  state.outputsByFile = {};
  downloadLinks.innerHTML = '';
  downloads.hidden = true;

  // Reset each row to "Queued" with 0% and non-clickable name
  renderFileList();

  // Setup this run
  const total = state.files.reduce((s, f) => s + f.size, 0);
  if (total > state.budget) {
    showBanner(`Total selected ${fmtBytes(total)} exceeds budget ${fmtBytes(state.budget)}. Will process sequentially.`, 'error');
  }
  const concurrency = clamp(+($('#concurrency').value || 1), 1, 4);
  const target = targetFormat.value;

  let i = 0, active = 0, failed = 0;

  const next = () => {
    if (isStale(runId)) return; // stop scheduling if a new run started

    while (active < concurrency && i < state.files.length) {
      const jobIndex = i++;
      const f = state.files[jobIndex];
      active++;
      runJob(f, jobIndex, target, runId)
        .then(() => { if (isStale(runId)) return; active--; next(); })
        .catch(() => { if (isStale(runId)) return; active--; failed++; next(); });
    }

    if (!active && i >= state.files.length) {
      if (isStale(runId)) return; // old run finishing after a new run started
      downloads.hidden = state.outputs.length === 0;
      showBanner(`Done. ${state.outputs.length} succeeded${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'ok');
    }
  };

  next();
});


async function runJob(file, index, target, runId) {
  const card = document.getElementById('file-list')?.children[index];
  const status = $('#status-' + index);
  const prog = $('#prog-' + index);

  // Start: shrink bar + prevent download
  if (card) card.classList.add('is-converting');
  const nameEl = card?.querySelector('.f-name');
  if (nameEl) {
    nameEl.classList.remove('clickable');
    nameEl.setAttribute('aria-disabled', 'true');
    nameEl.removeAttribute('tabindex');
    nameEl.removeAttribute('role');
  }
  if (status) status.textContent = 'Converting…';
  if (prog) prog.value = 0;

  try {
    if (status) status.textContent = 'Converting…';
    if (prog) prog.value = 0;

    // let the progress handler know which row to update
    state.activeProgressIndex = index;
    const outs = await convertFile(file, target, index);
    if (isStale(runId)) return; // a newer run started; ignore late result

    // store per-file outputs & make filename clickable (for this run)
    registerOutputs(index, outs, runId, target);


    // add to global downloads list (only if still current)
    outs.forEach(({ blob, name }) => {
      if (isStale(runId)) return;
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url; a.download = name; a.textContent = 'Download ' + name;
      downloadLinks.append(a);
      state.outputs.push({ name, blob, url });
    });

  } catch (err) {
    if (isStale(runId)) return; // cancelled mid-flight; don't touch UI
    if (status) {
      status.textContent = 'Failed';
      status.style.color = 'var(--danger)';
    }
    card?.classList.remove('is-converting');
    console.error(err);
    throw err;
  }
}


saveAllBtn.addEventListener('click', async () => {
  if (!state.outputs.length) {
    showBanner('No outputs yet. Convert first.', 'error');
    return;
  }

  // If the File System Access API exists, try it first.
  if ('showDirectoryPicker' in window) {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const out of state.outputs) {
        const fh = await dir.getFileHandle(out.name, { create: true });
        const ws = await fh.createWritable();
        await ws.write(out.blob);
        await ws.close();
      }
      showBanner('Saved all files to your chosen folder.', 'ok');
      return;
    } catch (e) {
      // User cancellation should NOT trigger any downloads.
      const name = e?.name || '';
      if (name === 'AbortError' || name === 'NotAllowedError') {
        // Cancel / permission denied by user → do nothing.
        showBanner('Save cancelled.', 'info');
        return;
      }
      // Other errors: surface and stop (don’t auto-download).
      console.warn('Save-all failed', e);
      showBanner('Couldn’t open the folder. Try again or download individually below.', 'error');
      return;
    }
  }

  // Fallback only if the picker is not supported at all:
  for (const a of [...downloadLinks.querySelectorAll('a')]) {
    a.click();
    await new Promise(r => setTimeout(r, 150));
  }
  showBanner('Triggered downloads for each file.', 'ok');
});


/* ========= 9) Inline ad reveal (optional) ========= */
(function () {
  if (!SHOW_ADS) { const fa = $('.footer-ads'); const ia = $('#inline-ad'); if (fa) fa.style.display = 'none'; if (ia) ia.style.display = 'none'; return; }
  const dl = $('#download-links'); const inlineAd = $('#inline-ad');
  const obs = new MutationObserver(() => { if (dl.children.length > 0) { if (inlineAd) inlineAd.style.display = 'block'; obs.disconnect(); } });
  if (dl) obs.observe(dl, { childList: true });
})();

showBanner('Ready. Add files, pick output, and hit Convert.');

/* ========= 9) Ads toggles (unchanged) ========= */
(function () {
  const masterEnabled = (typeof window.SHOW_ADS !== 'undefined') ? !!window.SHOW_ADS : true;
  const sideEnabled = (() => {
    const anySet = (typeof window.SHOW_SIDE_ADS !== 'undefined')
      || (typeof window.show_side !== 'undefined')
      || (typeof window.showSide !== 'undefined');
    if (!anySet) return true;
    return !!(window.SHOW_SIDE_ADS ?? window.show_side ?? window.showSide);
  })();
  const bottomEnabled = (() => {
    const anySet = (typeof window.SHOW_BOTTOM_ADS !== 'undefined')
      || (typeof window.show_bottom !== 'undefined')
      || (typeof window.showBottom !== 'undefined');
    if (!anySet) return true;
    return !!(window.SHOW_BOTTOM_ADS ?? window.show_bottom ?? window.showBottom);
  })();

  const sideAds = document.getElementById('side-ads');
  const footerAds = document.querySelector('.footer-ads');
  const bottomAds = document.getElementById('bottom-ads');
  const inlineAd = document.getElementById('inline-ad');
  const downloadWrap = document.getElementById('download-links');

  const setBottomSafe = (px) => { document.documentElement.style.setProperty('--bottom-safe', '0px'); };
  const measureAdHeight = () => {
    const cand = [];
    const fa = document.querySelector('.footer-ads');
    const ba = document.getElementById('bottom-ads');
    if (fa && fa.offsetParent !== null) cand.push(fa);
    if (ba && ba.offsetParent !== null) cand.push(ba);
    [fa, ba].forEach(el => { if (el && !cand.includes(el) && isShown(el)) cand.push(el); });
    if (!cand.length) return 0;
    const h = Math.max(...cand.map(el => el.getBoundingClientRect().height || 0));
    return h;
  };
  const isShown = (el) => {
    const style = window.getComputedStyle(el);
    return style && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  if (!masterEnabled) {
    [sideAds, footerAds, bottomAds, inlineAd].forEach(n => n && n.remove());
    setBottomSafe(0);
    return;
  }
  if (!sideEnabled && sideAds) sideAds.remove();
  if (!bottomEnabled) {
    if (footerAds) footerAds.remove();
    if (bottomAds) bottomAds.remove();
    setBottomSafe(0);
  }

  const railMedia = window.matchMedia('(min-width: 1200px)');
  const updatePlacement = () => {
    const wide = railMedia.matches;
    const liveSide = document.getElementById('side-ads');
    if (liveSide) liveSide.style.display = (sideEnabled && wide) ? 'block' : 'none';
    const liveFooter = document.querySelector('.footer-ads');
    if (liveFooter) liveFooter.style.display = (bottomEnabled && !wide) ? '' : 'none';
    const liveBottom = document.getElementById('bottom-ads');
    if (liveBottom) liveBottom.style.display = (bottomEnabled && wide) ? 'flex' : 'none';
    setBottomSafe(measureAdHeight());
  };
  railMedia.addEventListener('change', updatePlacement);
  updatePlacement();

  (() => {
    const root = document.getElementById('bottom-ads');
    if (!root) return;
    const btn = root.querySelector('.ad-close');
    if (!btn) return;
    btn.addEventListener('click', () => {
      root.remove();
      setBottomSafe(measureAdHeight());
    });
  })();

  if (inlineAd && downloadWrap) {
    const obs = new MutationObserver(() => {
      if (downloadWrap.children.length > 0) {
        inlineAd.style.display = 'block';
        obs.disconnect();
      }
    });
    obs.observe(downloadWrap, { childList: true });
  }

  let ro;
  const watch = () => {
    setBottomSafe(measureAdHeight());
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => setBottomSafe(measureAdHeight()));
      const fa = document.querySelector('.footer-ads');
      const ba = document.getElementById('bottom-ads');
      if (fa) ro.observe(fa);
      if (ba) ro.observe(ba);
    } else {
      window.addEventListener('resize', () => setBottomSafe(measureAdHeight()));
    }
  };
  window.requestAnimationFrame(watch);
})();
