---
title: Benchmarks — Speed, Quality & Privacy
meta_description: Transparent, reproducible benchmarks for the in-browser converter. Dataset, timing method, and steps to reproduce.
robots: index,follow
canonical: https://www.all-in-one-converter.net/benchmarks/
---
We publish transparent benchmarks across representative formats. **Everything runs client-side**; no files are uploaded.
## Dataset
- Path (placeholder): `/data/benchmarks/sample.json`
- Composition: small/medium/large audio (MP3/FLAC), video (MP4/WebM), docs (PDF/DOCX), images (JPG/PNG/WEBP).
- Sourcing: public domain or self-generated fixtures.
- Storage: versioned in repo under `/data/benchmarks/` (or attached release artifact).
## Timing methodology
- Browser: Chromium stable; cold/warm runs.
- Device: 8-core laptop baseline; power-saving off.
- Warmup: pre-init FFmpeg once before timed run.
- Measurement: `performance.now()` around the conversion call; **3 runs** per case; median reported.
- Privacy: all files processed locally; **no network transfer**.
## Reproduce
1. Open the site, add the dataset files, and run conversions.
2. Use DevTools Performance panel or the included script in `/tests` (future).
3. Compare with the chart below.
### Results (placeholder)
<div id="bench-chart" data-src="/data/benchmarks/sample.json" role="img" aria-label="Benchmark timings"></div>
<script defer src="/assets/bench-charts.js"></script>
### Notes
- Absolute times vary by hardware; **relative comparisons** are what matter.
- We focus on **LCP/INP/CLS** while the page is ready to convert; ads are below the fold on mobile to minimize CLS.
