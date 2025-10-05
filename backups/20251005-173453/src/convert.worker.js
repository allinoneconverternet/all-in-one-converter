self.onmessage = async (e) => {
  const { buf, outFmt } = e.data || {};
  try {
    const { convertArchive } = await import("./convert.js");
    const out = await convertArchive(new Uint8Array(buf), outFmt);
    self.postMessage({ ok: true, buf: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: String(err?.message ?? err) });
  }
};
