(function () {
  const EP = (typeof window !== 'undefined' && window.__ANALYTICS_ENDPOINT__) || '';
  function post(name, payload) {
    if (!EP) return;
    try {
      const body = JSON.stringify({ name, ts: Date.now(), url: location.href, payload: payload || {} });
      if (navigator.sendBeacon) return navigator.sendBeacon(EP, body);
      fetch(EP, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(()=>{});
    } catch {}
  }
  window.trackEvent = function (name, payload) { post(name, payload); };
  post('page_view', { referrer: document.referrer || '' });
  document.addEventListener('change', function (e) {
    const el = e.target;
    if (el && el.matches && el.matches('input[type="file"]') && el.files) {
      post('add_files', { count: el.files.length });
    }
  }, true);
  document.addEventListener('click', function (e) {
    const btn = e.target && (e.target.closest('#convertBtn,[data-action="convert"],.btn-convert'));
    if (btn) post('convert_start', { id: btn.id || btn.getAttribute('data-action') || 'convert' });
    const a = e.target && e.target.closest('a[download], button[download]');
    if (a) post('convert_success', { file: a.getAttribute('download') || a.getAttribute('href') || '' });
  }, true);
  window.addEventListener('error', function (e) {
    post('error', { message: String(e.message || 'err'), source: String(e.filename||''), line: e.lineno||0 });
  });
})();
