/* ffmpeg-esm-shim.local.js — LOCAL ONLY */
(function () {
  // If already set, do nothing
  if (globalThis.FFmpeg?.createFFmpeg) return;

  // Adopt local UMD (vendor/ffmpeg/ffmpeg.js exposes FFmpegWASM.FFmpeg)
  if (globalThis.FFmpegWASM?.FFmpeg) {
    const FFmpegClass = globalThis.FFmpegWASM.FFmpeg;
    const createFFmpeg = (opts = {}) => new FFmpegClass(opts);
    const fetchFile = globalThis.FFmpegWASM.fetchFile;
    globalThis.FFmpeg = { createFFmpeg, fetchFile };
  }
})();
