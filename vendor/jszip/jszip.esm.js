/* Local-first ESM wrapper around UMD JSZip */
export default (async () => {
  if (!globalThis.JSZip) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/vendor/jszip/jszip.min.js";
      s.async = true;
      s.onload = () => res();
      s.onerror = () => rej(new Error("Failed to load local JSZip"));
      document.head.appendChild(s);
    });
  }
  return globalThis.JSZip;
})();
