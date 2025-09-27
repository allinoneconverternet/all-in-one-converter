#!/usr/bin/env node
/**
 * Generate static HTML pages from Markdown/MDX under /content.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const contentRoot = path.join(projectRoot, "content");
const templatePath = path.join(projectRoot, "templates", "markdown-page.template.html");
const csvPath = path.join(projectRoot, "seo-converter-landing-pages.csv");

const stripBOM = (s) => String(s).replace(/^\uFEFF/, "");

// Infer site origin from CSV canonical URLs or SITE_ORIGIN
async function inferOrigin() {
  if (process.env.SITE_ORIGIN) return String(process.env.SITE_ORIGIN).replace(/\/+$/, "");
  try {
    const csv = stripBOM(await fs.readFile(csvPath, "utf8"));
    const rows = parseCsv(csv, { columns: true, skip_empty_lines: true });
    const row = rows.find((r) => r.canonical && /^https?:\/\//i.test(r.canonical));
    if (row) {
      const u = new URL(row.canonical);
      return `${u.protocol}//${u.host}`;
    }
  } catch {}
  return "";
}

function toSlug(absPath) {
  const rel = path.relative(contentRoot, absPath).replace(/\\/g, "/");
  const out = "/" + rel.replace(/\.(md|mdx)$/i, "");
  return out.replace(/\/index$/i, "/").replace(/\/+$/, "") || "/";
}

function firstMatch(re, s) {
  const m = s.match(re);
  return m ? m[1].trim() : "";
}

// Build FAQ JSON-LD from "## FAQ" -> "### Q" + paragraph answers
function buildFaqJsonLd(origin, slug, md) {
  const faqSection = md.split(/^##\s+FAQ\s*$/mi)[1];
  if (!faqSection) return "";
  const qas = [];
  const lines = faqSection.split(/\r?\n/);
  let currentQ = null;
  let currentA = [];
  for (const line of lines) {
    const q = line.match(/^###\s+(.+)/);
    if (q) {
      if (currentQ && currentA.length) {
        qas.push({ q: currentQ, a: currentA.join("\n").trim() });
      }
      currentQ = q[1].trim();
      currentA = [];
    } else {
      if (currentQ !== null) currentA.push(line);
    }
  }
  if (currentQ && currentA.length) qas.push({ q: currentQ, a: currentA.join("\n").trim() });
  if (!qas.length) return "";

  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": qas.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": a
      }
    })),
    "url": (origin || "") + slug
  };
  return JSON.stringify(data, null, 2);
}

marked.use({ headerIds: true, mangle: false });
const renderer = new marked.Renderer();
renderer.image = function (href, title, text) {
  const t = title ? ` title="${title}"` : "";
  const alt = text ? ` alt="${text.replace(/"/g, '&quot;')}"` : ' alt=""';
  const src = href || "";
  return `<img src="${src}"${t}${alt} loading="lazy" decoding="async">`;
};
marked.setOptions({ renderer });

async function renderOne(absPath, origin, templateHtml) {
  const raw = stripBOM(await fs.readFile(absPath, "utf8"));
  const slug = toSlug(absPath);
  const title = firstMatch(/^#\s+(.+?)\s*$/m, raw) || "Untitled";
  const firstPara = firstMatch(/^\s*(?:#.+?\n+)?([^#\n][\s\S]*?)\n{2,}/m, raw).replace(/\n+/g, " ").trim();
  const desc = (firstPara || "").slice(0, 170).replace(/\s+\S*$/, "");
  const faqJsonLd = buildFaqJsonLd(origin, slug, raw);
  const html = marked.parse(raw);
  const canonical = (origin ? origin : "") + slug;

  let out = templateHtml
    .replaceAll("{{title}}", title)
    .replaceAll("{{meta_description}}", desc)
    .replaceAll("{{canonical}}", canonical)
    .replaceAll("{{robots}}", "index,follow,max-image-preview:large")
    .replaceAll("{{twitter_card}}", "summary_large_image")
    .replaceAll("{{og_image_tag}}", "")
    .replaceAll("{{twitter_image_tag}}", "")
    .replace("{{faq_jsonld}}", faqJsonLd || "{}")
    .replace("{{content}}", html);

  const outFile = path.join(projectRoot, slug.replace(/^\//, ""), "index.html");
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, out, "utf8");
  console.log("Wrote", path.relative(projectRoot, outFile));
}

async function main() {
  const origin = await inferOrigin();
  const templateHtml = await fs.readFile(templatePath, "utf8");
  async function* walk(dir) {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) yield* walk(p);
      else if (/\.(md|mdx)$/i.test(ent.name)) yield p;
    }
  }
  try {
    for await (const fp of walk(contentRoot)) {
      await renderOne(fp, origin, templateHtml);
    }
  } catch (e) {
    if (e.code === "ENOENT") {
      console.warn("No /content directory found. Skipping.");
      return;
    }
    throw e;
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
