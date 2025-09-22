// Drop-in FFmpeg loader for same-origin worker + CDN core (VER=0.12.10)
async function needFFmpeg() {
  if (window.__ffmpeg?.loaded) return window.__ffmpeg;

  const VER = '0.12.10';
  const LOCAL = 'vendor/ffmpeg/';

  const CDN_WRAP = `https://unpkg.com/@ffmpeg/ffmpeg@${VER}/dist/umd/ffmpeg.js`;
  const CDN_CORE = `https://unpkg.com/@ffmpeg/core@${VER}/dist/umd/ffmpeg-core.js`;

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });

  // 1) Wrapper: local → CDN
  if (!(window.FFmpeg && window.FFmpeg.createFFmpeg)) {
    try { await loadScript(LOCAL + 'ffmpeg.js'); } catch { }
    if (!(window.FFmpeg && window.FFmpeg.createFFmpeg)) await loadScript(CDN_WRAP);
  }
  if (!(window.FFmpeg && window.FFmpeg.createFFmpeg)) throw new Error('FFmpeg wrapper failed to load');

  // 2) Core: use CDN (you can switch to LOCAL + probe later)
  const corePath = CDN_CORE;

  // 3) Worker: always local bootstrap (prevents cross-origin Worker errors)
  const workerPath = LOCAL + 'worker.js';

  const ffmpeg = window.FFmpeg.createFFmpeg({ log: true, corePath });
  await ffmpeg.load();

  if (!window.fetchFile && window.FFmpeg?.fetchFile) window.fetchFile = window.FFmpeg.fetchFile;
  window.__ffmpeg = ffmpeg;
  return ffmpeg;
}