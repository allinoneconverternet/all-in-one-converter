#!/usr/bin/env node
/**
 * Generate robots.txt, sitemap-index.xml, and segmented sitemaps.
 * Inputs:
 *  - CSV: seo-converter-landing-pages.csv (columns: slug, canonical, ...)
 *  - Filesystem: scans for .html files to include non-convert pages (e.g., /index.html)
 *
 * Output files at project root:
 *   /robots.txt
 *   /sitemap-index.xml
 *   /sitemap-convert-1.xml, /sitemap-convert-2.xml, ...
 *   /sitemap-static-1.xml, /sitemap-static-2.xml, ...
 *
 * Env:
 *   SITE_ORIGIN (optional) — e.g., https://www.all-in-one-converter.net
 *   SEGMENT_SIZE (optional) — max URLs per sitemap file (default 50000)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const csvPath = path.join(projectRoot, "seo-converter-landing-pages.csv");
const outRoot = projectRoot;

const SEGMENT_SIZE = parseInt(process.env.SEGMENT_SIZE || "50000", 10);

// util
const stripBOM = (s) => String(s).replace(/^\uFEFF/, "");
const toIso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

/** Read CSV of converter pages */
async function readCsvRoutes() {
  let csv;
  try {
    csv = stripBOM(await fs.readFile(csvPath, "utf8"));
  } catch {
    return [];
  }
  const rows = parseCsv(csv, { columns: true, skip_empty_lines: true });
  return rows.map((r) => ({
    slug: String(r.slug || "").trim(),
    canonical: String(r.canonical || "").trim(),
  }));
}

/** Derive site origin from first canonical URL in CSV, or SITE_ORIGIN env, else throw */
function getSiteOrigin(csvRows) {
  const envOrigin = process.env.SITE_ORIGIN && String(process.env.SITE_ORIGIN).trim();
  if (envOrigin) return envOrigin.replace(/\/+$/, "");
  const rowWithCanonical = csvRows.find((r) => r.canonical && /^https?:\/\//i.test(r.canonical));
  if (rowWithCanonical) {
    const u = new URL(rowWithCanonical.canonical);
    return `${u.protocol}//${u.host}`;
  }
  throw new Error(
    "SITE_ORIGIN not set and no canonical URLs found in CSV. Set SITE_ORIGIN env var, e.g. https://www.all-in-one-converter.net"
  );
}

/** Collect URLs from CSV + filesystem (.html files) with lastmod timestamps */
async function collectUrls(origin, csvRows) {
  const urls = { convert: [], static: [] };

  // 1) From CSV for /convert pages
  for (const r of csvRows) {
    const slug = String(r.slug || "").trim();
    if (!slug) continue;
    const u = r.canonical && /^https?:\/\//i.test(r.canonical) ? r.canonical : origin + slug;
    // Try to find generated HTML file for lastmod
    let lastmod = new Date();
    try {
      // expect /convert/{slug}/index.html OR slug path with index.html
      const seg = slug.replace(/^\/+/, "").replace(/\/+$/, "");
      const outHtml = path.join(projectRoot, seg, "index.html");
      const st = await fs.stat(outHtml);
      lastmod = st.mtime;
    } catch {
      // fall back to "now"
    }
    urls.convert.push({ loc: u, lastmod: lastmod });
  }

  // 2) From filesystem for other .html (non /convert)
  async function walk(dir) {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      const rel = path.relative(projectRoot, p);
      if (
        rel.startsWith(".git") ||
        rel.startsWith("node_modules") ||
        rel.startsWith("tests") ||
        rel.startsWith("vendor") ||
        rel.startsWith("scripts") ||
        rel.startsWith("workers") ||
        rel.startsWith("convert")
      ) {
        continue;
      }
      if (ent.isDirectory()) {
        await walk(p);
      } else if (ent.isFile() && ent.name.endsWith(".html")) {
        const st = await fs.stat(p);
        let urlPath = "/" + rel.replace(/\\/g, "/");
        if (urlPath.endsWith("/index.html")) {
          urlPath = urlPath.replace(/\/index\.html$/, "/");
        }
        const loc = origin + urlPath;
        urls.static.push({ loc, lastmod: st.mtime });
      }
    }
  }
  await walk(projectRoot);

  // Deduplicate by loc, preferring most recent lastmod
  for (const key of Object.keys(urls)) {
    const seen = new Map();
    for (const item of urls[key]) {
      const prev = seen.get(item.loc);
      if (!prev || new Date(item.lastmod) > new Date(prev.lastmod)) {
        seen.set(item.loc, item);
      }
    }
    urls[key] = Array.from(seen.values()).sort((a, b) => a.loc.localeCompare(b.loc));
  }

  return urls;
}

/** Write a urlset file for a list of {loc,lastmod} entries, return file path and max lastmod */
async function writeSitemapUrls(filename, entries) {
  if (!entries.length) return null;
  const maxLastmod = entries.reduce(
    (acc, e) => (new Date(e.lastmod) > new Date(acc) ? e.lastmod : acc),
    entries[0].lastmod
  );
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <lastmod>${toIso(e.lastmod)}</lastmod>\n  </url>`
      )
      .join("\n") +
    `\n</urlset>\n`;
  const outPath = path.join(outRoot, filename);
  await fs.writeFile(outPath, xml, "utf8");
  return { path: outPath, lastmod: maxLastmod };
}

/** Write sitemap index referencing a list of sitemap files */
async function writeSitemapIndex(origin, items /* {filename,lastmod}[] */) {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    items
      .map(
        (it) =>
          `  <sitemap>\n    <loc>${escapeXml(origin + "/" + it.filename)}</loc>\n    <lastmod>${toIso(
            it.lastmod
          )}</lastmod>\n  </sitemap>`
      )
      .join("\n") +
    `\n</sitemapindex>\n`;
  await fs.writeFile(path.join(outRoot, "sitemap-index.xml"), xml, "utf8");
}

/** Write robots.txt allowing assets + pointing to sitemap index */
async function writeRobots(origin) {
  const lines = [
    "# robots.txt generated by scripts/generate-sitemaps.mjs",
    "User-agent: *",
    "Allow: /",
    "Allow: /js/",
    "Allow: /workers/",
    "Allow: /convert/",
    "Allow: /styles.css",
    "Allow: /favicon.ico",
    "Disallow:",
    "",
    `Sitemap: ${origin}/sitemap-index.xml`,
    "",
  ];
  await fs.writeFile(path.join(outRoot, "robots.txt"), lines.join("\n"), "utf8");
}

function escapeXml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Split array into chunks */
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const csvRows = await readCsvRoutes();
  const origin = getSiteOrigin(csvRows);
  const urls = await collectUrls(origin, csvRows);

  // segment and write sitemaps
  const indexItems = [];

  // convert
  const convertChunks = chunk(urls.convert, SEGMENT_SIZE);
  for (let i = 0; i < convertChunks.length; i++) {
    const seg = await writeSitemapUrls(`sitemap-convert-${i + 1}.xml`, convertChunks[i]);
    if (seg) indexItems.push({ filename: path.basename(seg.path), lastmod: seg.lastmod });
  }

  // static
  const staticChunks = chunk(urls.static, SEGMENT_SIZE);
  for (let i = 0; i < staticChunks.length; i++) {
    const seg = await writeSitemapUrls(`sitemap-static-${i + 1}.xml`, staticChunks[i]);
    if (seg) indexItems.push({ filename: path.basename(seg.path), lastmod: seg.lastmod });
  }

  // index + robots
  await writeSitemapIndex(origin, indexItems);
  await writeRobots(origin);

  console.log(`Wrote robots.txt and ${indexItems.length} sitemap file(s) + sitemap-index.xml`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
