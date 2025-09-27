#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import { buildBreadcrumbJsonLd, buildFaqJsonLd } from "./lib/jsonld.mjs";
import { buildMetaForRow } from "./lib/meta.mjs";
import { buildCluster, renderClusterList } from "./lib/link-clusters.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const csvPath = path.join(projectRoot, "seo-converter-landing-pages.csv");
const templatePath = path.join(projectRoot, "templates", "conversion-page.template.html");
const outRoot = path.join(projectRoot, "convert");

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback = null) => {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return fallback;
};

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseSrcDst(slug) {
  const m = String(slug).trim().match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)\/?$/);
  return m ? { src: m[1], dst: m[2] } : { src: null, dst: null };
}

function pickRelated(rows, current, limit = 8) {
  const { src: curSrc, dst: curDst } = parseSrcDst(current.slug);
  const score = (row) => {
    const { src, dst } = parseSrcDst(row.slug);
    let s = 0;
    if (src && src === curSrc) s += 2;
    if (dst && dst === curDst) s += 1;
    return s;
  };
  const pool = rows.filter((r) => r !== current);
  pool.sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return String(a.primary_keyword).localeCompare(String(b.primary_keyword));
  });
  const out = [];
  const seen = new Set();
  for (const r of pool) {
    if (score(r) === 0) continue;
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    out.push(r);
    if (out.length >= limit) break;
  }
  for (const r of rows) {
    if (out.length >= limit) break;
    if (seen.has(r.slug) || r === current) continue;
    out.push(r);
    seen.add(r.slug);
  }
  return out.slice(0, limit);
}

async function clean() {
  await fs.rm(outRoot, { recursive: true, force: true });
  console.log("Cleaned", path.relative(projectRoot, outRoot));
}

async function main() {
  if (args.has("--clean")) {
    await clean();
    return;
  }
  const csvRaw = await fs.readFile(csvPath, "utf8");
  const records = parseCsv(csvRaw, { columns: true, skip_empty_lines: true, bom: true });
  const template = await fs.readFile(templatePath, "utf8");

  let chosen = records;
  if (args.has("--sample")) {
    const n = parseInt(getArg("--sample", "3"), 10) || 3;
    chosen = records.slice(0, n);
  } else if (args.has("--all")) {
    // use all rows
  } else {
    console.warn("No flag provided; defaulting to --sample 3");
    chosen = records.slice(0, 3);
  }

  await fs.mkdir(outRoot, { recursive: true });

  for (const row of chosen) {
    const slug = String(row.slug || "").trim();
    if (!slug.startsWith("/convert/")) {
      console.warn("Skipping row with invalid slug:", slug);
      continue;
    }
    const relPath = slug.replace(/^\//, "");
    const dir = path.join(projectRoot, relPath);
    await fs.mkdir(dir, { recursive: true });

    const clusterRows = buildCluster(records, row, 6, 12);
    const related = renderClusterList(clusterRows);
const faqJsonLd = buildFaqJsonLd(row);


    const breadcrumbsJsonLd = buildBreadcrumbJsonLd({ canonical: row.canonical, slug: row.slug });
    const meta = buildMetaForRow(row);
    
// Add reciprocal links to format encyclopedia pages
const m = String(row.slug).match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)\/?$/);
let formatLinksHTML = "";
if (m) {
  const src = m[1].toUpperCase();
  const dst = m[2].toUpperCase();
  formatLinksHTML = [
    "<h2>About these formats</h2>",
    "<p>Curious about the formats involved?</p>",
    "<ul>",
    `<li>What is <a href="/formats/${m[1]}/">.${src}</a>?</li>`,
    `<li>What is <a href="/formats/${m[2]}/">.${dst}</a>?</li>`,
    "</ul>"
  ].join("\n");
}const html = template
      .replaceAll("{{title}}", meta.titleEsc)
      .replaceAll("{{meta_description}}", meta.descriptionEsc)
      .replaceAll("{{related_json}}", escapeHtml(JSON.stringify(clusterRows.map(r => ({ href: r.slug, label: r.primary_keyword })))))
      .replaceAll("{{slug}}", escapeHtml(row.slug))
      .replaceAll("{{canonical}}", escapeHtml(row.canonical || ""))
      .replaceAll("{{robots}}", meta.robots)
      .replaceAll("{{twitter_card}}", meta.twitterCard)
      .replaceAll("{{og_image_tag}}", meta.ogImageTag)
      .replaceAll("{{twitter_image_tag}}", meta.twitterImageTag)
      
      .replaceAll("{{format_links}}", formatLinksHTML).replaceAll("{{h1}}", escapeHtml(row.h1))
      .replaceAll("{{intro_paragraph}}", escapeHtml(row.intro_paragraph))
      .replaceAll("{{faq_q1}}", escapeHtml(row.faq_q1))
      .replaceAll("{{faq_a1}}", escapeHtml(row.faq_a1))
      .replaceAll("{{faq_q2}}", escapeHtml(row.faq_q2))
      .replaceAll("{{faq_a2}}", escapeHtml(row.faq_a2))
      .replaceAll("{{related_links}}", related)
      .replace("{{faq_jsonld}}", faqJsonLd)
      .replace("{{breadcrumbs_jsonld}}", breadcrumbsJsonLd);

    const outFile = path.join(dir, "index.html");
    await fs.writeFile(outFile, html, "utf8");
    console.log("Wrote", path.relative(projectRoot, outFile));
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});



