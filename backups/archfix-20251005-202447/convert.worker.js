const v = Date.now().toString();

// Minimal 'document' shim for worker context (for libs that peek at document.baseURI)
if (typeof self.document === "undefined" || !self.document) {
  self.document = { baseURI: self.location?.href || "/", currentScript: { src: self.location?.href || "/" } };
}

function postPct(x) {
  const pct = Math.max(0, Math.min(100, Math.round((x || 0) * 100)));
  self.postMessage({ type: "progress", pct });
}

self.onmessage = async (e) => {
  const { cmd, fmt, buf } = e.data || {};
  if (cmd !== "convert" || !buf || !fmt) {
    self.postMessage({ type: "error", error: "Bad worker request" });
    return;
  }
  try {
    const { convertArchive, setProgressHook } = await import(./convert.js?v=);
    setProgressHook((x) => postPct(x));
    postPct(0);
    const outU8 = await convertArchive(new Uint8Array(buf), fmt);
    self.postMessage({ type: "done", buf: outU8.buffer }, [outU8.buffer]);
  } catch (err) {
    self.postMessage({ type: "error", error: (err?.stack || err?.message || String(err)) });
  }
};
