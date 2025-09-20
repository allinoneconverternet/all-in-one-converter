/* ffmpeg-esm-shim.js (robust) */
(function () {
  (async () => {
    try {
      // 1) Try ESM (both named + default exports)
      const MOD_VER = '0.12.15';
      const m = await import(`https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${MOD_VER}/+esm`);

      let FFmpegClass =
        m?.FFmpeg || m?.default?.FFmpeg || globalThis.FFmpegWASM?.FFmpeg;
      let createFFmpeg =
        m?.createFFmpeg || m?.default?.createFFmpeg ||
        (FFmpegClass ? (opts = {}) => new FFmpegClass(opts) : null);

      let fetchFile =
        m?.fetchFile || m?.default?.fetchFile ||
        (async (input) => {
          if (input instanceof Uint8Array) return input;
          if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
          if (typeof input === 'string' || input instanceof URL) {
            const r = await fetch(input); return new Uint8Array(await r.arrayBuffer());
          }
          // ArrayBuffer or anything with arrayBuffer()
          if (input?.arrayBuffer) return new Uint8Array(await input.arrayBuffer());
          if (input instanceof ArrayBuffer) return new Uint8Array(input);
          throw new Error('fetchFile fallback: unsupported input');
        });

      // 2) As a last resort, adopt globals some UMD builds expose
      if (!createFFmpeg && globalThis.FFmpeg?.createFFmpeg) {
        createFFmpeg = globalThis.FFmpeg.createFFmpeg;
      }
      if (!createFFmpeg && globalThis.FFmpegWASM?.FFmpeg) {
        FFmpegClass = globalThis.FFmpegWASM.FFmpeg;
        createFFmpeg = (opts = {}) => new FFmpegClass(opts);
      }

      // 3) Publish a consistent shape
      if (createFFmpeg) {
        window.FFmpeg = { createFFmpeg, fetchFile };
      }
      console.log('[ffmpeg-esm-shim] ready:', !!window.FFmpeg?.createFFmpeg);
      if (!window.FFmpeg?.createFFmpeg) {
        console.warn('[ffmpeg-esm-shim] no createFFmpeg found; check wrapper build/namespace');
      }
    } catch (e) {
      console.error('[ffmpeg-esm-shim] failed to import ESM:', e);
    }
  })();
})();
