# Contributing
## Requirements
- Node.js **18+**
- npm
## Commands
- `npm run build` — generate conversion pages, hubs, i18n, markdown, sitemaps, icons.
- `npm run serve:static` — serve at http://127.0.0.1:5173
- `npm run qa:crawl` — link integrity + coverage
- `npm run lhci` — Lighthouse CI quick pass
## Page generation
- Source CSV: `/seo-converter-landing-pages.csv`
- Generators: `/scripts/generate-conversion-pages.mjs`, `/scripts/generate-category-hubs.mjs`, `/scripts/generate-markdown-pages.mjs`, `/scripts/generate-i18n.mjs`, `/scripts/generate-sitemaps.mjs`
## Structured data
- `BreadcrumbList` + `FAQPage` on conversion pages; global `WebSite` JSON-LD.
## i18n & slugs
- Configure `/i18n/config.json`; localized slug map in `/i18n/slug-map.json`.
## Sitemaps
- Segmented + per-locale: `sitemap-convert-<locale>-*.xml`
## CWV guardrails
- Ads below the fold on mobile; reserve ad slot sizes.
## QA
- `qa-crawl` must pass in CI.
## Privacy
- Events only; no PII. Optional S3 sink.
