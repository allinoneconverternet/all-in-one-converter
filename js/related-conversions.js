(function(){
  try {
    const sec = document.querySelector('section.related[data-cluster]');
    if (!sec) return;
    const ul = sec.querySelector('ul');
    if (!ul) return;

    const raw = sec.getAttribute('data-cluster') || '[]';
    let items = [];
    try { items = JSON.parse(raw); } catch (e) { items = []; }
    if (!Array.isArray(items) || items.length === 0) return;

    const seen = new Set();
    const norm = [];
    for (const it of items) {
      const href = String(it && it.href || '').trim();
      const label = String(it && it.label || '').trim();
      if (!href || !label) continue;
      if (seen.has(href)) continue;
      seen.add(href);
      norm.push({ href, label });
    }
    if (norm.length === 0) return;

    ul.innerHTML = norm.map(it => `<li><a href="${escapeHtml(it.href)}">${escapeHtml(it.label)}</a></li>`).join('\n        ');
  } catch (e) {
    (window.DEBUG_CONVERTER ? console.warn : function(){})('related-conversions failed:', e);
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();


