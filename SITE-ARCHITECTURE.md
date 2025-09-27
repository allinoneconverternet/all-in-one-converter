# Site Architecture
- Static site generated via Node scripts (CSV + Markdown).
- Routes: `/convert/{src}-to-{dst}/`, `/convert/{category}/`, and content pages.
- Structured data: global `WebSite` + per-page `BreadcrumbList`/`FAQPage`.
- i18n: localized slugs, hreflang injection, per-locale sitemaps.
- CWV: minimal above-the-fold; ad slots reserved to prevent CLS.
- QA: crawler checks 4xx/5xx, duplicate titles, CSV coverage.
- Analytics: privacy-friendly events; optional JSONL sink.
