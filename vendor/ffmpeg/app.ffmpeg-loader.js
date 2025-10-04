// FFmpeg loader — singleton + clamped progress
// Wrap everything to avoid polluting globals and to support multiple script includes safely.
(function () {
  if (typeof window === 'undefined') return;

  // If we've already patched/initialized this loader, do nothing.
  if (window.__FFMPEG_LOADER_PATCHED__) return;
  window.__FFMPEG_LOADER_PATCHED__ = true;

  // Load the UMD wrapper exactly once (either local or min variant).
  async function loadWrapperOnce() {
    if (window.__FFMPEG_LIB_PROMISE__) return window.__FFMPEG_LIB_PROMISE__;

    const WRAPPERS = [
      '/vendor/ffmpeg/ffmpeg.js',
      '/vendor/ffmpeg/ffmpeg.min.js'
    ];

    const loadScript = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => queueMicrotask(resolve);
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });

    const detectAPI = () => {
      // 0.12+ UMD exports
      if (window.FFmpeg?.FFmpeg || window.FFmpeg?.createFFmpeg) {
        return { ns: window.FFmpeg, hasClass: !!window.FFmpeg.FFmpeg, hasFactory: !!window.FFmpeg.createFFmpeg };
      }
      // some builds export under FFmpegWASM
      if (window.FFmpegWASM?.FFmpeg || window.FFmpegWASM?.createFFmpeg) {
        window.FFmpeg = window.FFmpegWASM; // normalize
        return { ns: window.FFmpegWASM, hasClass: !!window.FFmpegWASM.FFmpeg, hasFactory: !!window.FFmpegWASM.createFFmpeg };
      }
      return null;
    };

    window.__FFMPEG_LIB_PROMISE__ = (async () => {
      let api = detectAPI();
      for (const url of (!api ? WRAPPERS : [])) {
        try {
          console.log('[FFmpeg wrapper] loading', url);
          await loadScript(url);
          api = detectAPI();
          if (api) break;
        } catch (e) {
          console.warn('[FFmpeg wrapper] failed', url, e);
        }
      }
      if (!api) {
        console.error('[FFmpeg] diagnostics: crossOriginIsolated=', window.crossOriginIsolated);
        throw new Error('FFmpeg UMD wrapper failed to load');
      }
      return api;
    })();

    return window.__FFMPEG_LIB_PROMISE__;
  }

  // Public: returns a SINGLE FFmpeg instance. Concurrent calls share the same promise.
  window.needFFmpeg = async function needFFmpeg() {
    // If an instance exists and is loaded, return immediately.
    if (window.__ffmpeg?.loaded || window.__ffmpeg?.isLoaded?.()) return window.__ffmpeg;
    // If construction is already in progress, await it.
    if (window.__ffmpegPromise) return window.__ffmpegPromise;

    const VER = '0.12.10';
    const CORE_ST = `https://unpkg.com/@ffmpeg/core@${VER}/dist/umd/ffmpeg-core.js`;
    const CORE_MT = `https://unpkg.com/@ffmpeg/core-mt@${VER}/dist/umd/ffmpeg-core.js`;
    const useMT = !!window.crossOriginIsolated;
    const coreURL = useMT ? CORE_MT : CORE_ST;
    const wasmURL = coreURL.replace(/\.js$/, '.wasm');
    const workerURL = coreURL.replace(/\.js$/, '.worker.js');

    window.__ffmpegPromise = (async () => {
      const api = await loadWrapperOnce();

      // Instantiate depending on API shape
      let ff;
      if (api.hasClass) {
        // 0.12+ "class" — options go to .load()
        ff = new api.ns.FFmpeg();
      } else if (api.hasFactory) {
        // Legacy factory — options go to createFFmpeg({...}) (NOT to .load())
        ff = api.ns.createFFmpeg({ log: true, corePath: coreURL });
      } else {
        throw new Error('FFmpeg wrapper exposes neither class nor factory');
      }

      // Progress/log hooks (support both models), clamped to [0, 1].
      const onProgress = ({ progress, ratio }) => {
        let r = (typeof progress === 'number' ? progress : ratio) || 0;
        if (!Number.isFinite(r)) r = 0;
        if (r < 0) r = 0;
        if (r > 1) r = 1;
        const p = Math.round(r * 100);
        console.log('[ffmpeg] progress', p + '%');

        // Optional global callback for app.js
        try { if (typeof window.onFfmpegProgress === 'function') window.onFfmpegProgress(r); } catch { }

        // Optional progress element
        const g = document.getElementById('global-ffmpeg-progress');
        if (g && 'value' in g) g.value = p;
      };

      if (typeof ff.on === 'function') {
        ff.on('log', ({ type, message }) => {
          if (type === 'info' || type === 'fferr' || type === 'ffout') console.log('[ffmpeg]', type, message);
        });
        ff.on('progress', onProgress);
      } else if (typeof ff.setProgress === 'function') {
        ff.setProgress(onProgress);
      }

      // Load core
      if (typeof ff.load === 'function') {
        if (api.hasClass) {
          // 0.12+ class: pass URLs to load()
          await ff.load({ r: { coreURL, wasmURL, workerURL } });
        } else {
          // factory: URLs were passed to createFFmpeg(); load() takes no args
          await ff.load();
        }
      } else {
        throw new Error('FFmpeg instance has no .load()');
      }

      if (!window.fetchFile && api.ns?.fetchFile) window.fetchFile = api.ns.fetchFile;

      window.__ffmpeg = ff;       // cache the singleton
      return ff;
    })();

    try {
      return await window.__ffmpegPromise;
    } finally {
      // Cleanup the in-flight handle once resolved/rejected;
      // the actual instance stays cached in window.__ffmpeg
      delete window.__ffmpegPromise;
    }
  };

  // Exec shim: accepts (...args) or a single argv array; uses exec() if present, else run()
  window.ffExec = async function ffExec(ff, ...args) {
    const argv = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
    if (typeof ff.exec === 'function') return ff.exec(argv);
    return ff.run(...argv);
  };
})();