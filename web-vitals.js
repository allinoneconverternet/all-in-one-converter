/* Lightweight field data hook for LCP/INP/CLS (with attribution) */
(function () {
  function send(metric) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'web_vitals',
        metric_name: metric.name,
        value: metric.value,
        id: metric.id,
        rating: metric.rating,
        navigationType: (performance.getEntriesByType('navigation')[0] || {}).type || 'navigate'
      });
    } catch (e) {}

    try {
      var url = window.__VITALS_ENDPOINT__ || '';
      if (url && navigator.sendBeacon) {
        var body = JSON.stringify({
          name: metric.name,
          value: metric.value,
          id: metric.id,
          rating: metric.rating,
          url: location.href,
          ts: Date.now()
        });
        navigator.sendBeacon(url, body);
      }
    } catch (e) {}

    console.log('[Vitals]', metric.name, metric.value, metric);
  }

  var s = document.createElement('script');
  s.src = 'https://unpkg.com/web-vitals@3/dist/web-vitals.attribution.iife.js';
  s.defer = true;
  s.onload = function () {
    try {
      webVitals.onLCP(send, { reportAllChanges: true });
      webVitals.onINP(send, { reportAllChanges: true });
      webVitals.onCLS(send, { reportAllChanges: true });
    } catch (e) { console.warn('web-vitals hook failed', e); }
  };
  document.head.appendChild(s);
})();

