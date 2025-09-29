/* js/ffmpeg-worker-client.js
 * Thin main-thread wrapper around /workers/ffmpeg.worker.js with a typed message protocol.
 * - Lazily spawns the worker on first use
 * - Provides a simple .convert({ args, files, outputs }) API
 * - Emits progress via callback
 */

/**
 * @typedef {{ name: string, data: ArrayBuffer }} FilePart
 * @typedef {{
 *   args: string[],
 *   files: FilePart[],
 *   outputs?: string[],
 *   timeoutMs?: number,
 *   onProgress?: (p: { ratio: number, percent: number }) => void,
 *   onLog?: (e: { level: string, message: string }) => void
 * }} ConvertOptions
 * @typedef {{ name: string, data: ArrayBuffer }} OutFile
 */

export class FFmpegWorkerClient {
  /** @type {Worker|null} */ #worker = null;
  /** @type {Map<string, (msg: any)=>void>} */ #resolvers = new Map();
  /** @type {Map<string, (err: any)=>void>} */ #rejectors = new Map();
  /** @type {Map<string, ConvertOptions>} */ #ctx = new Map();

  /** Spawn the worker if needed */
  #ensureWorker() {
    if (this.#worker) return this.#worker;
    const w = new Worker('/workers/ffmpeg.worker.js');
    w.onmessage = (ev) => this.#onMessage(ev.data);
    this.#worker = w;
    return w;
  }

  /** @param {any} msg */
  #onMessage(msg) {
    const { type, id } = msg || {};
    if (type === 'progress' && id && this.#ctx.get(id)?.onProgress) {
      this.#ctx.get(id)?.onProgress?.({ ratio: msg.ratio, percent: msg.percent });
      return;
    }
    if (type === 'log' && id && this.#ctx.get(id)?.onLog) {
      this.#ctx.get(id)?.onLog?.({ level: msg.level, message: msg.message });
      return;
    }
    if ((type === 'done' || type === 'error') && id) {
      const resolve = this.#resolvers.get(id);
      const reject = this.#rejectors.get(id);
      this.#resolvers.delete(id);
      this.#rejectors.delete(id);
      const ctx = this.#ctx.get(id);
      this.#ctx.delete(id);
      if (type === 'done' && resolve) resolve(msg);
      else if (type === 'error' && reject) reject(new Error(msg.message || 'Conversion failed'));
      return;
    }
  }

  /** @returns {Promise<void>} */
  async init() {
    const w = this.#ensureWorker();
    w.postMessage({ type: 'init' });
    return;
  }

  /**
   * Run a conversion entirely in the worker.
   * @param {ConvertOptions} options
   * @returns {Promise<{ files: OutFile[], timeMs: number }>}
   */
  async convert(options) {
    const id = Math.random().toString(36).slice(2);
    const w = this.#ensureWorker();
    const payload = {
      type: 'convert',
      id,
      args: options.args,
      inputs: options.files,
      outputs: options.outputs,
      timeoutMs: options.timeoutMs ?? 0,
    };
    this.#ctx.set(id, options);
    const p = new Promise((resolve, reject) => {
      this.#resolvers.set(id, (msg) => resolve({ files: msg.files, timeMs: msg.timeMs }));
      this.#rejectors.set(id, reject);
    });
    // Transfer buffers
    const transfers = [];
    for (const f of options.files) transfers.push(f.data);
    w.postMessage(payload, transfers);
    return /** @type {Promise<{ files: OutFile[], timeMs: number }>} */ (p);
  }
}


