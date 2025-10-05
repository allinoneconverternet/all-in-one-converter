// === BEGIN PATCH: robust worker + watchdog ===
let _worker;
function getWorker() {
  if (_worker) return _worker;
  const base =
    (typeof import !== 'undefined' && typeof import.meta !== 'undefined' && import.meta.url) ? import.meta.url :
    (typeof document !== 'undefined' && document.baseURI) ? document.baseURI :
    (typeof self !== 'undefined' && self.location && self.location.href) ? self.location.href :
    '/';
  const url = new URL('./src/convert.worker.js?v=' + Date.now(), base).toString();
  _worker = new Worker(url, { type: 'module' });
  return _worker;
}

async function convertWith(fmt, file) {
  const ab = await file.arrayBuffer();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    let cleaned = false;
    const clean = () => {
      if (cleaned) return; cleaned = true;
      w.removeEventListener('message', onMsg);
      w.removeEventListener('error', onErr);
      w.removeEventListener('messageerror', onMsgErr);
      clearTimeout(timer);
    };

    const onMsg = (ev) => {
      const { type, pct, buf, error } = ev.data || {};
      if (type === 'progress') {
        try { updateRowProgress(pct); } catch {}
      } else if (type === 'done') {
        try { updateRowProgress(100); } catch {}
        clean();
        resolve(new Blob([buf], { type: mimeFor(fmt) }));
      } else if (type === 'error') {
        clean();
        reject(new Error(error || 'Archive conversion failed (worker)'));
      }
    };

    const onErr = (e) => { clean(); reject(new Error('Worker error: ' + (e.message || e.filename || e.lineno || 'unknown'))); };
    const onMsgErr = (e) => { clean(); reject(new Error('Worker messageerror: ' + (e && e.toString ? e.toString() : 'unknown'))); };

    w.addEventListener('message', onMsg);
    w.addEventListener('error', onErr);
    w.addEventListener('messageerror', onMsgErr);

    const timer = setTimeout(() => {
      try { w.terminate(); } catch {}
      clean();
      reject(new Error('Archive conversion timed out after 120s.'));
    }, 120000);

    w.postMessage({ cmd: 'convert', fmt, buf: ab }, [ab]);
  });
}
// === END PATCH ===
