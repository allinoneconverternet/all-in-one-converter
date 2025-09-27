(function () {
  function render(el, data) {
    const w = Math.max(320, el.clientWidth || 640);
    const h = 180, pad = 28;
    const max = Math.max(1, ...data.map(d => d.ms));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Benchmark timings (ms)");
    const axis = document.createElementNS(svg.namespaceURI, "path");
    axis.setAttribute("d", `M${pad} ${h-pad} H${w-pad} M${pad} ${h-pad} V${pad}`);
    axis.setAttribute("stroke", "currentColor");
    axis.setAttribute("stroke-opacity", "0.3");
    axis.setAttribute("fill", "none");
    svg.appendChild(axis);
    const bw = (w - pad*2) / data.length;
    data.forEach((d,i) => {
      const bh = Math.max(2, Math.round((d.ms/max)*(h - pad*2)));
      const rect = document.createElementNS(svg.namespaceURI, "rect");
      rect.setAttribute("x", pad + i*bw + 4);
      rect.setAttribute("y", h - pad - bh);
      rect.setAttribute("width", Math.max(6, bw - 8));
      rect.setAttribute("height", bh);
      rect.setAttribute("fill", "currentColor");
      rect.setAttribute("fill-opacity", "0.6");
      rect.setAttribute("role", "presentation");
      svg.appendChild(rect);
      if (i % Math.ceil(data.length/6) === 0) {
        const t = document.createElementNS(svg.namespaceURI, "text");
        t.setAttribute("x", pad + i*bw + bw/2);
        t.setAttribute("y", h - 8);
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("font-size", "10");
        t.textContent = d.label;
        svg.appendChild(t);
      }
    });
    el.innerHTML = "";
    el.appendChild(svg);
  }
  async function init() {
    const el = document.getElementById("bench-chart");
    if (!el) return;
    const src = el.getAttribute("data-src");
    try {
      const res = await fetch(src, { cache: "no-store" });
      const data = await res.json();
      render(el, data);
      addEventListener("resize", () => render(el, data));
    } catch (e) { console.warn("bench chart failed", e); }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
