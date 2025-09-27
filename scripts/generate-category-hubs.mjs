#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { CATS, ORDER, categoryForSlug, categoryLabel } from "./lib/categories.mjs";
const root = process.cwd();
const csvPath = path.join(root, "seo-converter-landing-pages.csv");
const tplPath = path.join(root, "templates", "category-hub.template.html");
function esc(s){ return String(s||"").replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
const csv = await fs.readFile(csvPath, "utf8");
const rows = parseCsv(csv, { columns: true, skip_empty_lines: true });
const tpl = await fs.readFile(tplPath, "utf8");
const groups = Object.fromEntries(ORDER.map(k => [k, []]));
for (const r of rows) {
  const cat = categoryForSlug(r.slug);
  if (groups[cat]) groups[cat].push(r);
}
for (const cat of ORDER) {
  const list = groups[cat].sort((a,b)=>String(a.primary_keyword).localeCompare(String(b.primary_keyword))).slice(0,24);
  const grid = list.map(r => `<li><a href="${esc(r.slug)}">${esc(r.primary_keyword || r.slug.replace(/^\/convert\//,''))}</a></li>`).join("\n      ");
  const out = tpl
    .replaceAll("{{title}}", `Convert ${categoryLabel(cat)} — Top Conversions`)
    .replaceAll("{{meta_description}}", `Browse the most popular ${categoryLabel(cat)} conversions.`)
    .replaceAll("{{canonical}}", `https://www.all-in-one-converter.net/convert/${cat}/`)
    .replaceAll("{{cat_label}}", categoryLabel(cat))
    .replaceAll("{{h1}}", `${categoryLabel(cat)} Conversions`)
    .replaceAll("{{intro}}", `Hand-picked ${categoryLabel(cat)} conversions generated locally in your browser — no uploads.`)
    .replaceAll("{{grid_links}}", grid)
    .replaceAll("{{year}}", String(new Date().getFullYear()));
  const dir = path.join(root, "convert", cat);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), out, "utf8");
  console.log("Wrote hub:", path.relative(root, path.join(dir,"index.html")));
}
