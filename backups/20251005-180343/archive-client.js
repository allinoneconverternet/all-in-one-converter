/* archive-client.js
   Imported by app.js via convertArchiveFile(...) -> dynamic import.
   Updates the same progress bar/status used by media jobs. */
let _worker;

function getWorker() {
  if (_worker) return _worker;
  _worker = new Worker(new URL("./src/convert.worker.js", import.meta.url), { type: "module" });
  return _worker;
}

function updateRowProgress(pct) {
  try {
    const idx = (window.state && Number.isInteger(window.state.activeProgressIndex))
      ? window.state.activeProgressIndex : null;
    if (idx == null) return;
    const progEl = document.getElementById("prog-" + idx);
    const statusEl = document.getElementById("status-" + idx);
    const val = Math.max(0, Math.min(100, Math.round(pct)));
    if (progEl) progEl.value = val;
    if (statusEl) {
      statusEl.textContent = val >= 100
        ? (window.t?.("finishing") || "Finishing...")
        : (window.t?.("convertingPct", { pct: val }) || ("Converting... " + val + "%"));
    }
  } catch {}
}

function mimeFor(fmt) {
  switch (fmt) {
    case "zip": return "application/zip";
    case "7z":  return "application/x-7z-compressed";
    case "tar": return "application/x-tar";
    case "tar.gz":  return "application/gzip";
    case "tar.bz2": return "application/x-bzip2";
    case "tar.xz":  return "application/x-xz";
    default: return "application/octet-stream";
  }
}

async function convertWith(fmt, file) {
  const ab = await file.arrayBuffer();
  const w = getWorker();

  return new Promise((resolve, reject) => {
    const onMsg = (ev) => {
      const { type, pct, buf, error } = ev.data || {};
      if (type === "progress") {
        updateRowProgress(pct);
      } else if (type === "done") {
        updateRowProgress(100);
        w.removeEventListener("message", onMsg);
        const blob = new Blob([buf], { type: mimeFor(fmt) });
        resolve(blob);
      } else if (type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error(error || "Archive conversion failed"));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ cmd: "convert", fmt, buf: ab }, [ab]);
  });
}

// Public API expected by app.js:
export async function convertArchiveToZip(file)    { return convertWith("zip", file); }
export async function convertArchiveTo7z(file)     { return convertWith("7z", file); }
export async function convertArchiveToTar(file)    { return convertWith("tar", file); }
export async function convertArchiveToTarGz(file)  { return convertWith("tar.gz", file); }
export async function convertArchiveToTarBz2(file) { return convertWith("tar.bz2", file); }
export async function convertArchiveToTarXz(file)  { return convertWith("tar.xz", file); }
