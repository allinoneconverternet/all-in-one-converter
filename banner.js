/**
 * Small, accessible, dismissible banner under the hero.
 * Persistence via localStorage. No scroll lock.
 * Exposes window.showBanner(msg, kind) for optional reuse.
 */
(function () {
  const KEY = "support_banner_dismissed_v1";

  function findInsertAfter() {
    // Prefer after the hero section
    const hero = document.querySelector(".prepanel");
    if (hero && hero.parentNode) return hero;
    // Fallback: after header
    const header = document.querySelector("header");
    return header || document.body;
  }

  function ensureBannerElement() {
    let el = document.getElementById("support-banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "support-banner";
      el.className = "notice-banner";
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", "Site support notice");
      el.innerHTML = `
        <div class="notice-content">
          <strong>Free &amp; private:</strong> This converter runs entirely in your browser. If you find it useful,
          <a href="#support" rel="nofollow">consider supporting the site</a>.
        </div>
        <button id="support-banner-dismiss" class= "btn-ghost small" aria-label="Dismiss support notice">Dismiss</button>
      `;
      const after = findInsertAfter();
      if (after.nextSibling) after.parentNode.insertBefore(el, after.nextSibling);
      else after.parentNode.appendChild(el);
    }
    return el;
  }

  function showSupportBanner() {
    const el = ensureBannerElement();
    el.hidden = false;
    const btn = el.querySelector("#support-banner-dismiss");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        try { localStorage.setItem(KEY, "1"); } catch {}
        el.hidden = true;
      });
    }
  }

  // Optional API to reuse the banner for messages
  window.showBanner = function (msg, kind = "info") {
    const el = ensureBannerElement();
    const content = el.querySelector(".notice-content");
    if (content && msg) {
      content.textContent = String(msg);
    }
    el.hidden = false;
  };

  document.addEventListener("DOMContentLoaded", () => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === "1"; } catch {}
    if (!dismissed) showSupportBanner();
    else {
      const el = document.getElementById("support-banner");
      if (el) el.hidden = true;
    }
  });
})();
