/* app.js â€” full, fixed, copy-paste ready (waits for vendor libs) */

/* ========= 1) Config toggles ========= */
const ENABLE_OUTPUTS = {
  images: true,        // PNG, JPEG, WebP, SVG (and imageâ†’PDF)
  documents: true,     // PDF, DOCX
  text: true,          // TXT, MD, HTML, CSV, JSON, JSONL, RTF
  spreadsheets: true   // XLSX
};
async function needMammoth() {
  if (window.mammoth) return;
  try { await loadScript('vendor/mammoth.browser.min.js'); }
  catch { await loadScript('https://unpkg.com/mammoth/mammoth.browser.min.js'); }
}

async function needPdf() {
  if (window.pdfjsLib) return;
  try { await loadScript('vendor/pdf.min.js'); }
  catch { await loadScript('https://unpkg.com/pdfjs-dist/build/pdf.min.js'); }
  if (window.pdfjsLib?.GlobalWorkerOptions) {
    try { await loadScript('vendor/pdf.worker.min.js'); }
    catch { await loadScript('https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js'); }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      [...document.scripts].find(s => s.src.includes('pdf.worker'))?.src || 'vendor/pdf.worker.min.js';
  }
}

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
  ]
};

// Optional: show the demo ad panels
const SHOW_ADS = true;

/* ========= 2) Small helpers ========= */
const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
const fmtBytes = b => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`; };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const escapeHtml = s => s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const swapExt = (name, ext) => (name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name) + '.' + ext;
const baseName = n => (n.lastIndexOf('.') > 0 ? n.slice(0, n.lastIndexOf('.')) : n);

function estimateSafeBudgetBytes() {
  try { if (performance?.memory?.jsHeapSizeLimit) { const lim = performance.memory.jsHeapSizeLimit; return Math.max(80 * 1024 * 1024, Math.min(lim * 0.15, 500 * 1024 * 1024)); } } catch (e) { }
  const dm = navigator.deviceMemory || 4; const est = dm * 0.05 * 1024 * 1024 * 1024; return Math.max(80 * 1024 * 1024, Math.min(est, 400 * 1024 * 1024));
}

/* ========= 3) Vendor loader with local+CDN fallback ========= */
const features = { pdf: false, docx: false, xlsx: false, pptx: false, ocr: false, makePdf: false, makeDocx: false };

function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = () => res(); s.onerror = () => rej(new Error('load ' + url));
    document.head.appendChild(s);
  });
}
const CDN = {
  pdf: ['vendor/pdf.min.js', 'https://unpkg.com/pdfjs-dist/build/pdf.min.js'],
  pdfWorker: ['vendor/pdf.worker.min.js', 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js'],
  mammoth: ['vendor/mammoth.browser.min.js', 'https://unpkg.com/mammoth/mammoth.browser.min.js'],
  xlsx: ['vendor/xlsx.full.min.js', 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js'],
  jszip: ['vendor/jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip/dist/jszip.min.js'],
  tesseract: ['vendor/tesseract.min.js', 'https://cdn.jsdelivr.net/npm/tesseract.js/dist/tesseract.min.js'],
  jspdf: ['vendor/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf/dist/jspdf.umd.min.js'],
  docx: ['vendor/docx.min.js', 'https://cdn.jsdelivr.net/npm/docx/build/index.min.js'],
};
async function loadScriptTry(localUrl, cdnUrl) {
  try { await loadScript(localUrl); }
  catch { console.warn('Local missing, using CDN:', cdnUrl); await loadScript(cdnUrl); }
}
function loadedSrcContains(substr) {
  const s = [...document.querySelectorAll('script[src]')].map(n => n.src);
  return s.find(u => u.includes(substr));
}

// app.js â€” replace your ensureVendors() with this detect-only version
async function ensureVendors() {
  features.pdf = !!window.pdfjsLib;
  features.docx = !!window.mammoth;
  features.xlsx = !!window.XLSX;
  features.pptx = !!window.JSZip;
  features.ocr = !!window.Tesseract;
  features.makePdf = !!(window.jspdf && window.jspdf.jsPDF);
  features.makeDocx = !!window.docx;

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
    ].forEach(([label, ok]) => {
      const p = document.createElement('div');
      p.className = 'cap ' + (ok ? 'ok' : 'miss');
      p.textContent = (ok ? 'âœ“ ' : 'â¨¯ ') + label;
      caps.append(p);
    });
  }
  return features;
}

/* ========= 4) State & element refs ========= */
const state = { files: [], outputs: [], budget: estimateSafeBudgetBytes(), useAuto: true };

const memoryPill = $('#memory-pill'); const limitMode = $('#limit-mode'); const manualLimit = $('#manual-limit');
const targetFormat = $('#target-format'); const qualityWrap = $('#quality-wrap'); const quality = $('#quality');
const fileInput = $('#file-input'); const dropzone = $('#dropzone'); const fileList = $('#file-list'); const banner = $('#banner');
const convertBtn = $('#convert-btn'); const saveAllBtn = $('#save-all-btn'); const downloads = $('#downloads'); const downloadLinks = $('#download-links');

function refreshMemoryPill() { const mode = state.useAuto ? 'Auto' : 'Manual'; const mb = Math.round(state.budget / 1048576); memoryPill.innerHTML = `<strong>Memory:</strong> <small>${mode}</small> <span>â€¢</span> <span>${mb} MB</span>`; }
function showBanner(msg, tone = 'info') { const color = tone === 'error' ? 'var(--danger)' : (tone === 'ok' ? 'var(--ok)' : 'var(--muted)'); banner.innerHTML = `<span style="color:${color}">${msg}</span>`; }

/* ========= 5) Build target dropdown ========= */
(function buildTargets() {
  const groupsOrder = ['text', 'documents', 'spreadsheets', 'images'];
  const labels = { text: 'Text', documents: 'Documents', spreadsheets: 'Spreadsheets', images: 'Images' };
  targetFormat.innerHTML = '';
  for (const key of groupsOrder) {
    if (!ENABLE_OUTPUTS[key]) continue;
    const items = TARGET_GROUPS[key]; if (!items) continue;
    const og = document.createElement('optgroup'); og.label = labels[key];
    items.forEach(([val, label]) => { const o = document.createElement('option'); o.value = val; o.textContent = label; og.appendChild(o); });
    targetFormat.appendChild(og);
  }
  if (ENABLE_OUTPUTS.images && [...targetFormat.querySelectorAll('option')].some(o => o.value === 'jpeg')) {
    targetFormat.value = 'jpeg';
  }
  qualityWrap.style.display =
    (targetFormat.value === 'jpeg' || targetFormat.value === 'webp') ? '' : 'none';
})();

refreshMemoryPill();

/* Create a single promise and await it before converting */
const vendorsReady = ensureVendors();

/* ========= 6) File I/O & UI events ========= */
dropzone.addEventListener('dragenter', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));
$('#clear-btn').addEventListener('click', () => { state.files = []; state.outputs = []; renderFileList(); downloadLinks.innerHTML = ''; downloads.hidden = true; fileInput.value = ''; showBanner('Cleared.'); });

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
  showBanner(`Added ${files.length} file(s). Total: ${state.files.length}.`);
}

function detectKind(file) {
  const n = file.name.toLowerCase(); const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/') || /\.png$|\.jpe?g$|\.webp$|\.svg$/.test(n)) return 'image';
  if (/\.docx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (/\.pptx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (/\.pdf$/.test(n) || t === 'application/pdf') return 'pdf';
  if (/\.xlsx$/.test(n) || t === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (/\.csv$/.test(n) || t === 'text/csv') return 'csv';
  if (t.startsWith('text/') || ['application/json', 'text/html', 'text/markdown'].includes(t) || /\.txt$|\.md$|\.json$|\.html$/.test(n)) return 'text';
  return 'unknown';
}

function renderFileList() {
  fileList.innerHTML = '';
  if (!state.files.length) { fileList.innerHTML = '<div class="hint" style="padding:12px 0">No files yet.</div>'; return; }
  state.files.forEach((f, i) => {
    const card = el('div', 'filecard');
    const meta = el('div'); meta.innerHTML = `<div class="f-name" title="${f.name}"><strong>${f.name}</strong></div><div class="status">${fmtBytes(f.size)} â€¢ ${f.type || 'unknown'}</div>`;
    const badge = el('div', 'badge'); badge.textContent = detectKind(f);
    const prog = el('div'); prog.innerHTML = '<progress max="100" value="0" id="prog-' + i + '"></progress>';
    const status = el('div', 'status'); status.id = 'status-' + i; status.textContent = 'Queued';
    card.append(meta, badge, prog, status); fileList.append(card);
  });
}

/* ========= 7) Conversion dispatcher (mixed batch supported) ========= */
async function convertFile(file, target) {
  const kind = detectKind(file);
  const isImageOut = ['png', 'jpeg', 'webp', 'svg'].includes(target);
  if (isImageOut && !ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled by config.');

  if (kind === 'image') return convertImageFile(file, target);
  if (kind === 'pdf') return convertPdfFile(file, target);
  if (kind === 'docx') return convertDocxFile(file, target);
  if (kind === 'pptx') return convertPptxFile(file, target);
  if (kind === 'xlsx' || kind === 'csv') return convertSheetFile(file, target);
  if (kind === 'text') return convertTextFile(file, target);
  throw new Error('Unsupported file type');
}

/* ---- Text â†’ many ---- */
async function convertTextFile(file, target) {
  const raw = await file.text();
  if (target === 'md') return [{ blob: new Blob([raw], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }];
  if (target === 'html') return [{ blob: new Blob([`<!doctype html><meta charset="utf-8"><pre style="white-space:pre-wrap;word-wrap:anywhere">${escapeHtml(raw)}</pre>`], { type: 'text/html' }), name: swapExt(file.name, 'html') }];
  if (target === 'csv') { const rows = raw.replace(/\r\n/g, '\n').split('\n').map(l => '"' + l.replaceAll('"', '""') + '"').join('\n'); return [{ blob: new Blob([rows], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }]; }
  if (target === 'json') { try { const parsed = JSON.parse(raw); return [{ blob: new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; } catch { const lines = raw.replace(/\r\n/g, '\n').split('\n'); return [{ blob: new Blob([JSON.stringify(lines, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; } }
  if (target === 'jsonl') { const out = raw.replace(/\r\n/g, '\n').split('\n').map(l => l ? JSON.stringify({ line: l }) : '{}').join('\n'); return [{ blob: new Blob([out], { type: 'application/jsonl' }), name: swapExt(file.name, 'jsonl') }]; }
  if (target === 'rtf') { const rtf = `{\\rtf1\\ansi\n${escapeHtml(raw).replace(/\n/g, '\\par\n')}}`; return [{ blob: new Blob([rtf], { type: 'application/rtf' }), name: swapExt(file.name, 'rtf') }]; }
  if (target === 'docx') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makeDocx) throw new Error('DOCX output needs docx.min.js'); return textishToDocx(raw, file.name); }
  if (target === 'pdf') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makePdf) throw new Error('PDF output needs jspdf.umd.min.js'); return textishToPdf(raw, file.name); }
  if (target === 'xlsx') { if (!ENABLE_OUTPUTS.spreadsheets) throw new Error('Spreadsheet outputs disabled.'); if (!features.xlsx) throw new Error('XLSX output needs SheetJS'); const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(raw.split(/\r?\n/).map(l => [l])); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1'); const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return [{ blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: swapExt(file.name, 'xlsx') }]; }
  if (['png', 'jpeg', 'webp', 'svg'].includes(target)) { if (!ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled.'); return textToImageBlobs(raw, target, baseName(file.name)); }
  return [{ blob: new Blob([raw], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }];
}

/* ---- DOCX â†’ textish / images ---- */
async function convertDocxFile(file, target) {
  if (!features.docx) throw new Error('DOCX reading needs mammoth.js');
  const ab = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: ab });
  const txt = stripHtml(html);
  if (['png', 'jpeg', 'webp', 'svg'].includes(target)) { if (!ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled.'); return textToImageBlobs(txt, target, baseName(file.name)); }
  if (target === 'html') return [{ blob: new Blob([html], { type: 'text/html' }), name: swapExt(file.name, 'html') }];
  if (target === 'md') return [{ blob: new Blob([htmlToMarkdown(html)], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }];
  if (target === 'txt') return [{ blob: new Blob([txt], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }];
  if (target === 'json') return [{ blob: new Blob([JSON.stringify({ html }, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }];
  if (target === 'pdf') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makePdf) throw new Error('PDF output needs jsPDF'); return textishToPdf(txt, file.name); }
  if (target === 'docx') return [{ blob: file, name: file.name }];
  throw new Error('DOCX â†’ ' + target.toUpperCase() + ' not supported');
}

/* ---- PPTX â†’ textish / images-per-slide ---- */
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
  throw new Error('PPTX â†’ ' + target.toUpperCase() + ' not supported');
}

/* ---- PDF â†’ images/text ---- */
async function convertPdfFile(file, target) {
  if (!features.pdf) throw new Error('PDF support needs PDF.js');
  const ab = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument({ data: ab }).promise; const count = pdf.numPages;
  if (['png', 'jpeg', 'webp', 'svg'].includes(target)) {
    if (!ENABLE_OUTPUTS.images) throw new Error('Image outputs disabled.');
    const pages = []; const mime = target === 'png' ? 'image/png' : (target === 'jpeg' ? 'image/jpeg' : 'image/webp');
    for (let p = 1; p <= count; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
      const ctx = canvas.getContext('2d'); await page.render({ canvasContext: ctx, viewport }).promise;
      if (target === 'svg') {
        const dataUrl = canvas.toDataURL('image/png');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="${dataUrl}" width="100%" height="100%"/></svg>`;
        pages.push({ blob: new Blob([svg], { type: 'image/svg+xml' }), name: `${baseName(file.name)}_p${p}.svg` });
      } else {
        const q = target === 'png' ? undefined : Number(quality.value || 0.92);
        const blob = await new Promise(res => canvas.toBlob(res, mime, q));
        pages.push({ blob, name: `${baseName(file.name)}_p${p}.${target}` });
      }
    }
    if (pages.length === 1) return [pages[0]];
    if (!window.JSZip) return pages;
    const zip = new JSZip(); pages.forEach(p => zip.file(p.name, p.blob));
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return [{ blob: zipBlob, name: `${baseName(file.name)}_${target}_images.zip` }];
  }
  // Text-ish targets
  let all = ''; for (let p = 1; p <= count; p++) { const page = await pdf.getPage(p); const tc = await page.getTextContent(); all += (p > 1 ? '\n\n' : '') + tc.items.map(it => it.str).join(' '); }
  if (target === 'md') return [{ blob: new Blob([all], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }];
  if (target === 'html') return [{ blob: new Blob([`<!doctype html><meta charset="utf-8"><pre style="white-space:pre-wrap">${escapeHtml(all)}</pre>`], { type: 'text/html' }), name: swapExt(file.name, 'html') }];
  if (target === 'json') return [{ blob: new Blob([JSON.stringify({ text: all }, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }];
  if (target === 'csv') return [{ blob: new Blob([all.split('\n').map(l => '"' + l.replaceAll('"', '""') + '"').join('\n')], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }];
  if (target === 'jsonl') return [{ blob: new Blob([all.split('\n').map(l => l ? JSON.stringify({ line: l }) : '{}').join('\n')], { type: 'application/jsonl' }), name: swapExt(file.name, 'jsonl') }];
  if (target === 'rtf') return [{ blob: new Blob([`{\\rtf1\\ansi\n${escapeHtml(all).replace(/\n/g, '\\par\n')}}`], { type: 'application/rtf' }), name: swapExt(file.name, 'rtf') }];
  if (target === 'docx') { if (!ENABLE_OUTPUTS.documents) throw new Error('Document outputs disabled.'); if (!features.makeDocx) throw new Error('DOCX output needs docx.min.js'); return textishToDocx(all, file.name); }
  if (target === 'pdf') return [{ blob: file, name: file.name }];
  return [{ blob: new Blob([all], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }];
}

/* ---- CSV/XLSX â‡„ ---- */
async function convertSheetFile(file, target) {
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  if (isCSV) {
    const text = await file.text();
    if (target === 'xlsx') { if (!ENABLE_OUTPUTS.spreadsheets) throw new Error('Spreadsheet outputs disabled.'); if (!features.xlsx) throw new Error('CSVâ†’XLSX needs SheetJS'); const wb = XLSX.read(text, { type: 'string' }); const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return [{ blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: swapExt(file.name, 'xlsx') }]; }
    if (target === 'json') { const wb = XLSX.read(text, { type: 'string' }); const ws = wb.Sheets[wb.SheetNames[0]]; const json = XLSX.utils.sheet_to_json(ws, { defval: null }); return [{ blob: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; }
    if (target === 'html') { const wb = XLSX.read(text, { type: 'string' }); const ws = wb.Sheets[wb.SheetNames[0]]; const html = XLSX.utils.sheet_to_html(ws); return [{ blob: new Blob([html], { type: 'text/html' }), name: swapExt(file.name, 'html') }]; }
    if (['txt', 'md', 'csv'].includes(target)) { if (target === 'csv') return [{ blob: new Blob([text], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }]; if (target === 'txt') return [{ blob: new Blob([text], { type: 'text/plain' }), name: swapExt(file.name, 'txt') }]; if (target === 'md') return [{ blob: new Blob([text], { type: 'text/markdown' }), name: swapExt(file.name, 'md') }]; }
    throw new Error('CSV â†’ ' + target.toUpperCase() + ' not supported');
  }
  // XLSX
  if (!features.xlsx) throw new Error('XLSX support needs SheetJS');
  if (!['csv', 'json', 'html', 'xlsx'].includes(target)) throw new Error('XLSX â†’ ' + target.toUpperCase() + ' not supported');
  const ab = await file.arrayBuffer(); const wb = XLSX.read(ab, { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]];
  if (target === 'csv') { const csv = XLSX.utils.sheet_to_csv(ws); return [{ blob: new Blob([csv], { type: 'text/csv' }), name: swapExt(file.name, 'csv') }]; }
  if (target === 'json') { const json = XLSX.utils.sheet_to_json(ws, { defval: null }); return [{ blob: new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }), name: swapExt(file.name, 'json') }]; }
  if (target === 'html') { const html = XLSX.utils.sheet_to_html(ws); return [{ blob: new Blob([html], { type: 'text/html' }), name: swapExt(file.name, 'html') }]; }
  if (target === 'xlsx') { const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); return [{ blob: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name: swapExt(file.name, 'xlsx') }]; }
}

/* ---- Images â‡„ Images / SVG / PDF ---- */
async function convertImageFile(file, target) {
  if (!['png', 'jpeg', 'webp', 'svg', 'pdf'].includes(target)) {
    throw new Error('Image â†’ ' + target.toUpperCase() + ' supports PNG/JPEG/WebP/SVG/PDF');
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

/* ---- Render text to image (used by DOCX/TXT/PPTX â†’ JPEG/PNG/WebP/SVG) ---- */
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

/* ---- Textish â†’ PDF/DOCX ---- */
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

/* ---- Simple HTMLâ†’MD & strip ---- */
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
  // â³ Wait until vendor scripts (like mammoth) are loaded
  await vendorsReady;

  if (!state.files.length) { showBanner('Add some files first.', 'error'); return; }
  state.outputs = []; downloadLinks.innerHTML = ''; downloads.hidden = true;
  const total = state.files.reduce((s, f) => s + f.size, 0);
  if (total > state.budget) showBanner(`Total selected ${fmtBytes(total)} exceeds budget ${fmtBytes(state.budget)}. Will process sequentially.`, 'error');
  const concurrency = clamp(+($('#concurrency').value || 1), 1, 4);
  const target = targetFormat.value;
  let i = 0, active = 0, failed = 0;
  const next = () => { while (active < concurrency && i < state.files.length) { const jobIndex = i++; const f = state.files[jobIndex]; runJob(f, jobIndex, target).then(() => { active--; next(); }).catch(() => { active--; failed++; next(); }); active++; } if (active === 0 && i >= state.files.length) { downloads.hidden = state.outputs.length === 0; showBanner(`Done. ${state.outputs.length} succeeded${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'ok'); } };
  next();
});

async function runJob(file, index, target) {
  const prog = $('#prog-' + index); const status = $('#status-' + index); status.textContent = 'Convertingâ€¦';
  try {
    const outs = await convertFile(file, target);
    prog.value = 100; status.textContent = outs.length > 1 ? `Ready (${outs.length} files)` : 'Ready';
    outs.forEach(({ blob, name }) => { const url = URL.createObjectURL(blob); const a = el('a'); a.href = url; a.download = name; a.textContent = 'Download ' + name; downloadLinks.append(a); state.outputs.push({ name, blob, url }); });
  } catch (err) { status.textContent = 'Failed'; status.style.color = 'var(--danger)'; console.error(err); throw err; }
}

saveAllBtn.addEventListener('click', async () => {
  if (!state.outputs.length) { showBanner('No outputs yet. Convert first.', 'error'); return; }
  if ('showDirectoryPicker' in window) {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      for (const out of state.outputs) { const fh = await dir.getFileHandle(out.name, { create: true }); const ws = await fh.createWritable(); await ws.write(out.blob); await ws.close(); }
      showBanner('Saved all files to your chosen folder.', 'ok'); return;
    } catch (e) { console.warn('Save-all cancelled/failed', e); }
  }
  for (const a of [...downloadLinks.querySelectorAll('a')]) { a.click(); await new Promise(r => setTimeout(r, 150)); }
  showBanner('Triggered downloads for each file.');
});

showBanner('Ready. Add files, pick output, and hit Convert.');
/* ========= 9) Ads: master + per-placement toggles (side rails vs bottom bars) ========= */
(function () {
  // ---- Flags ---------------------------------------------------------------
  // Global master switch (fallback true if not defined).
  const masterEnabled = (typeof window.SHOW_ADS !== 'undefined') ? !!window.SHOW_ADS : true;

  // Per-placement toggles. We intentionally read several naming styles so you can set
  // them anywhere (index.html inline <script>, elsewhere, etc.). Defaults are true.
  const sideEnabled = (
    (typeof window.SHOW_SIDE_ADS !== 'undefined' && !!window.SHOW_SIDE_ADS) ||
    (typeof window.show_side !== 'undefined' && !!window.show_side) ||
    (typeof window.showSide !== 'undefined' && !!window.showSide) ||
    false
  ) ? true : (typeof window.SHOW_SIDE_ADS === 'undefined' 
              && typeof window.show_side === 'undefined' 
              && typeof window.showSide === 'undefined' ? true : false);

  const bottomEnabled = (
    (typeof window.SHOW_BOTTOM_ADS !== 'undefined' && !!window.SHOW_BOTTOM_ADS) ||
    (typeof window.show_bottom !== 'undefined' && !!window.show_bottom) ||
    (typeof window.showBottom !== 'undefined' && !!window.showBottom) ||
    false
  ) ? true : (typeof window.SHOW_BOTTOM_ADS === 'undefined' 
              && typeof window.show_bottom === 'undefined' 
              && typeof window.showBottom === 'undefined' ? true : false);

  // Elements
  const sideAds      = document.getElementById('side-ads');    // optional (desktop rails)
  const footerAds    = document.querySelector('.footer-ads');  // mobile bottom
  const bottomAds    = document.getElementById('bottom-ads');  // desktop bottom
  const inlineAd     = document.getElementById('inline-ad');   // inline reveal after outputs
  const downloadWrap = document.getElementById('download-links');

  // If global disabled: remove all ad elements entirely (no render, no layout cost)
  if (!masterEnabled) {
    [sideAds, footerAds, bottomAds, inlineAd].forEach(n => n && n.remove());
    return;
  }

  // If specific placements are disabled, remove their elements up-front.
  if (!sideEnabled)   { if (sideAds)   sideAds.remove();   }
  if (!bottomEnabled) { if (footerAds) footerAds.remove(); if (bottomAds) bottomAds.remove(); }

  // Compute responsive visibility for the remaining elements.
  const railMedia = window.matchMedia('(min-width: 1200px)'); // wide screens
  const updatePlacement = () => {
    const wide = railMedia.matches;

    // Side rails only on wide screens and only if element still exists
    const liveSide = document.getElementById('side-ads');
    if (liveSide) liveSide.style.display = (sideEnabled && wide) ? 'block' : 'none';

    // Mobile bottom bar when not wide
    const liveFooter = document.querySelector('.footer-ads');
    if (liveFooter)  liveFooter.style.display = (bottomEnabled && !wide) ? '' : 'none';

    // Desktop bottom bar on wide screens
    const liveBottom = document.getElementById('bottom-ads');
    if (liveBottom)  liveBottom.style.display = (bottomEnabled && wide) ? 'flex' : 'none';
  };
  railMedia.addEventListener('change', updatePlacement);
  updatePlacement();

  // Dismiss button for desktop bottom bar (if present)
  (() => {
    const root = document.getElementById('bottom-ads');
    if (!root) return;
    const btn = root.querySelector('.ad-close');
    if (!btn) return;
    btn.addEventListener('click', () => { root.remove(); });
  })();

  // Keep inline ad behavior: reveal only after outputs exist
  if (inlineAd && downloadWrap) {
    const obs = new MutationObserver(() => {
      if (downloadWrap.children.length > 0) {
        inlineAd.style.display = 'block';
        obs.disconnect();
      }
    });
    obs.observe(downloadWrap, { childList: true });
  }
})();

/* PATCH: default-target-from-URL (AIOC) */
(function(){
  function applyDefaultFromUrl(){
    try{
      // Change this selector if your dropdown uses a different id:
      var sel = document.querySelector('#target-format');
      if(!sel) return;

      // Match ".../something-to-something" (e.g. /docx-to-pdf, /convert/docx-to-pdf)
      var m = (location.pathname || '').toLowerCase().match(/([a-z0-9._-]+)-(?:to|zu|a|en|in|na|para)-([a-z0-9._-]+)/);
      var to = (m && m[2]) || (new URLSearchParams(location.search).get('to') || '');
      to = (to||'').replace(/^\./,'').toLowerCase();
      if(!to) return;

      // If that 'to' exists in the dropdown, select it now
      var opt = Array.from(sel.options||[]).find(function(o){ return (o.value||'').toLowerCase()===to; });
      if(opt){
        sel.value = opt.value;
        sel.dispatchEvent(new Event('change', { bubbles:true }));
      }
    }catch(e){ try{ console.warn('[applyDefaultFromUrl]', e); }catch(_){} }
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(applyDefaultFromUrl, 0); });
  }else{
    setTimeout(applyDefaultFromUrl, 0);
  }
})();


/* PATCH: guards (AIOC) */
(function(){
  function ensure(id, mk){
    var el = document.getElementById(id);
    if(!el && mk) { el = mk(); }
    return el;
  }
  // If your code calls refreshMemoryPill, make sure the container exists first.
  document.addEventListener('DOMContentLoaded', function(){
    ensure('memory-pill', function(){
      var h1 = document.querySelector('h1'); 
      var wrap = document.createElement('div');
      wrap.id = 'memory-pill'; wrap.className = 'memory-pill';
      (h1 && h1.parentElement ? h1.parentElement : document.body).appendChild(wrap);
      return wrap;
    });
  });
})();
