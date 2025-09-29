// Robust FFmpeg loader: local wrapper (same-origin worker), MT when isolated, ST fallback.
// Handles both UMD "class" (0.12+) and legacy factory builds.
async function needFFmpeg() {
  if (window.__ffmpeg?.loaded || window.__ffmpeg?.isLoaded?.()) return window.__ffmpeg;

  const VER = '0.12.10';

  // Wrapper candidates: LOCAL first (prevents cross-origin Worker), then CDN fallback
  const WRAPPERS = [
    '/vendor/ffmpeg/ffmpeg.js'   // local official UMD (0.12.10)
  ];


  // Cores (UMD). Use multi-thread only when the page is crossOriginIsolated
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

  // Ensure wrapper is present
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

  // Progress/log hooks (support both models)
  const onProgress = ({ progress, ratio }) => {
    const p = Math.round(((progress ?? ratio ?? 0) * 100));
    console.log('[ffmpeg] progress', p + '%');
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
      await ff.load({ log: true, coreURL, wasmURL, workerURL });
    } else {
      // factory: URLs were passed to createFFmpeg(); load() takes no args
      await ff.load();
    }
  } else {
    throw new Error('FFmpeg instance has no .load()');
  }

  if (!window.fetchFile && api.ns?.fetchFile) window.fetchFile = api.ns.fetchFile;

  window.__ffmpeg = ff;
  return ff;
}


// Exec shim: accepts (...args) or a single argv array; uses exec() if present, else run()
async function ffExec(ff, ...args) {
  const argv = (args.length === 1 && Array.isArray(args[0])) ? args[0] : args;
  if (typeof ff.exec === 'function') return ff.exec(argv);
  return ff.run(...argv);
}


