/* workers/ffmpeg.worker.js
 * Dedicated worker that runs all FFmpeg WASM work off the main thread.
 * - Loads the local UMD wrapper (vendor/ffmpeg/ffmpeg.js)
 * - Chooses MT core when crossOriginIsolated + SharedArrayBuffer are available; otherwise ST core
 * - Accepts "init", "convert", "abort", and "ping" messages
 * - Streams progress/logs back to main thread
 *
 * This worker is plain JS with rich JSDoc typedefs for intellisense/typing.
 */

/**
 * @typedef {'init'|'convert'|'abort'|'ping'} InboundType
 * @typedef {'ready'|'progress'|'log'|'error'|'done'|'pong'} OutboundType
 *
 * @typedef {{ type: 'init', id?: string }} InitMsg
 * @typedef {{ name: string, data: ArrayBuffer }} InputFile
 * @typedef {{
 *   type: 'convert',
 *   id: string,
 *   args: string[],
 *   inputs: InputFile[],
 *   outputs?: string[],      // expected output filenames; if omitted we guess common ones from args
 *   timeoutMs?: number
 * }} ConvertMsg
 * @typedef {{ type: 'abort', id?: string }} AbortMsg
 * @typedef {{ type: 'ping', id?: string }} PingMsg
 * @typedef {(InitMsg|ConvertMsg|AbortMsg|PingMsg)} Inbound
 *
 * @typedef {{ type: 'ready' }} ReadyEvt
 * @typedef {{ type: 'progress', id: string, ratio: number, percent: number }} ProgressEvt
 * @typedef {{ type: 'log', id: string, level: 'info'|'ffout'|'fferr', message: string }} LogEvt
 * @typedef {{ type: 'error', id?: string, message: string, code?: string }} ErrorEvt
 * @typedef {{ type: 'done', id: string, files: { name: string, data: ArrayBuffer }[], timeMs: number }} DoneEvt
 * @typedef {{ type: 'pong', id?: string }} PongEvt
 * @typedef {(ReadyEvt|ProgressEvt|LogEvt|ErrorEvt|DoneEvt|PongEvt)} Outbound
 */

let ffmpeg = /** @type {any|null} */ (null);
let controller = { aborted: false };

// Lazily load wrapper and core
async function ensureFFmpeg() {
  if (ffmpeg && (ffmpeg.loaded || ffmpeg.isLoaded?.())) return ffmpeg;

  // Load wrapper UMD into this worker's global scope
  if (!('FFmpeg' in self) && !('FFmpegWASM' in self)) {
    importScripts('/vendor/ffmpeg/ffmpeg.js');
    // Bridge UMD namespace to the shape expected by newer API
    if (self.FFmpegWASM?.FFmpeg && !self.FFmpeg?.createFFmpeg) {
      const FFmpegClass = self.FFmpegWASM.FFmpeg;
      const createFFmpeg = (opts = {}) => new FFmpegClass(/** @type {any} */(opts));
      const fetchFile = self.FFmpegWASM.fetchFile;
      // @ts-ignore
      self.FFmpeg = { createFFmpeg, fetchFile };
    }
  }

  /** Decide core variant URLs (prefer MT when possible; otherwise ST) */
  const canMT = !!(self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
  const coreURL   = canMT ? '/vendor/ffmpeg/ffmpeg-core.mt.js' : '/vendor/ffmpeg/ffmpeg-core.js';
  const wasmURL   = '/vendor/ffmpeg/ffmpeg-core.wasm';
  const workerURL = '/vendor/ffmpeg/worker.js';

  // Support both "class" and older "factory"
  /** @type {{ns: any, hasClass: boolean, hasFactory: boolean}} */
  const api = {
    ns: /** @type {any} */ (self.FFmpeg || self.FFmpegWASM),
    hasClass: !!(self.FFmpegWASM?.FFmpeg),
    hasFactory: !!(self.FFmpeg?.createFFmpeg),
  };

  if (!api.ns) throw new Error('FFmpeg wrapper not found in worker scope');

  // Instantiate
  /** @type {any} */
  let inst;
  if (api.hasClass) {
    inst = new api.ns.FFmpeg();
  } else if (api.hasFactory) {
    inst = api.ns.createFFmpeg({ log: true, corePath: coreURL });
  } else {
    throw new Error('FFmpeg wrapper exposes neither class nor factory');
  }

  // Hook logs & progress
  const onProgress = ({ progress, ratio }) => {
    const r = Math.max(0, Math.min(1, progress ?? ratio ?? 0));
    /** @type {ProgressEvt} */
    const evt = { type: 'progress', id: currentJobId || '', ratio: r, percent: Math.round(r * 100) };
    postMessage(evt);
  };
  if (typeof inst.on === 'function') {
    inst.on('log', ({ type, message }) => {
      /** @type {LogEvt} */ const e = { type: 'log', id: currentJobId || '', level: type, message: String(message || '') };
      postMessage(e);
    });
    inst.on('progress', onProgress);
  } else if (typeof inst.setProgress === 'function') {
    inst.setProgress(onProgress);
  }

  // Load core
  if (typeof inst.load === 'function') {
    if (api.hasClass) {
      await inst.load({ log: true, coreURL, wasmURL, workerURL });
    } else {
      await inst.load(); // factory: options were passed to createFFmpeg
    }
  }

  ffmpeg = inst;
  return ffmpeg;
}

let currentJobId = null;
let timeoutHandle = /** @type {any} */ (null);

function clearJobState() {
  currentJobId = null;
  if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
  controller.aborted = false;
}

async function runConvert(msg) {
  currentJobId = msg.id;
  const started = Date.now();
  try {
    const ff = await ensureFFmpeg();

    // Clear FS and write inputs
    if (typeof ff.reset === 'function') ff.reset();
    for (const { name, data } of msg.inputs) {
      const u8 = new Uint8Array(data);
      if (typeof ff.writeFile === 'function') ff.writeFile(name, u8);
      else ff.FS('writeFile', name, u8);
    }

    // Optional timeout
    if (msg.timeoutMs && msg.timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        controller.aborted = true;
        try { ff.exit?.(); } catch {}
        /** @type {ErrorEvt} */
        const e = { type: 'error', id: msg.id, message: 'Conversion timed out', code: 'ETIMEDOUT' };
        postMessage(e);
      }, msg.timeoutMs);
    }

    // Execute; 0.12+ prefers exec([...]), older uses run(...args)
    const argv = Array.isArray(msg.args) ? msg.args : [];
    if (typeof ff.exec === 'function') await ff.exec(argv);
    else await ff.run(...argv);

    // Collect outputs
    const outNames = Array.isArray(msg.outputs) && msg.outputs.length
      ? msg.outputs
      : guessOutputs(argv);
    /** @type {{name:string,data:ArrayBuffer}[]} */
    const outFiles = [];
    for (const out of outNames) {
      let buf;
      if (typeof ff.readFile === 'function') buf = ff.readFile(out);
      else buf = ff.FS('readFile', out);
      outFiles.push({ name: out, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    }

    clearJobState();
    /** @type {DoneEvt} */
    const done = { type: 'done', id: msg.id, files: outFiles, timeMs: Date.now() - started };
    postMessage(done);
  } catch (err) {
    clearJobState();
    const text = normalizeError(err);
    /** @type {ErrorEvt} */
    const e = { type: 'error', id: msg.id, message: text.message, code: text.code };
    postMessage(e);
  }
}

/** Try to infer outputs when not provided */
function guessOutputs(argv) {
  const outs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === 'output' || argv[i] === '-i') continue;
    if (/[^\/]+\.[a-z0-9]{2,5}$/i.test(argv[i]) && (i === 0 || argv[i-1] !== '-i')) {
      outs.push(argv[i]);
    }
  }
  return outs;
}

function normalizeError(err) {
  const raw = (err && (err.message || err.toString && err.toString())) || 'Unknown error';
  /** @type {{message:string, code?:string}} */
  const o = { message: String(raw) };
  const s = o.message.toLowerCase();
  if (s.includes('sharedarraybuffer') || s.includes('cross-origin isolated')) {
    o.code = 'ENOT_ISOLATED';
    o.message = 'This browser tab is not cross-origin isolated, so multi-threaded WASM is unavailable. The worker fell back to single-thread mode automatically.';
  } else if (s.includes('out of memory') || s.includes('wasm memory')) {
    o.code = 'ENOMEM';
    o.message = 'The conversion ran out of memory in the browser. Try a smaller file or a lower quality setting.';
  } else if (s.includes('network') || s.includes('fetch')) {
    o.code = 'ENET';
  }
  return o;
}

self.onmessage = /** @param {MessageEvent<Inbound>} */ (ev) => {
  const msg = ev.data;
  if (!msg || !msg.type) return;
  switch (msg.type) {
    case 'init':
      ensureFFmpeg().then(() => postMessage(/** @type {ReadyEvt} */({ type: 'ready' })))
        .catch((e) => postMessage(/** @type {ErrorEvt} */({ type: 'error', message: normalizeError(e).message })));
      break;
    case 'convert':
      runConvert(msg);
      break;
    case 'abort':
      controller.aborted = true;
      try { ffmpeg?.exit?.(); } catch {}
      break;
    case 'ping':
      postMessage(/** @type {PongEvt} */({ type: 'pong', id: msg.id }));
      break;
  }
};
