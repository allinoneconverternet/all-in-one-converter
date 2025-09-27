#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const i18nRoot = path.join(projectRoot, "i18n");

async function readJson(p) {
  let txt = await fs.readFile(p, "utf8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1); // strip UTF-8 BOM
  return JSON.parse(txt);
}

const cfg = await readJson(path.join(i18nRoot, "config.json"));
const slugMap = await readJson(path.join(i18nRoot, "slug-map.json"));

const normSlug = s => (s.startsWith("/") ? s : "/" + s);
const fileFromSlug = slug => path.join(projectRoot, normSlug(slug).replace(/^\//, ""), "index.html");

function parseSrcDstFromEnSlug(slug) {
  const m = normSlug(slug).match(/\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)/);
  return m ? { src: m[1].toUpperCase(), dst: m[2].toUpperCase() } : { src: "SRC", dst: "DST" };
}
function getOriginFromHtml(html) {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (m) { try { const u = new URL(m[1]); return `${u.protocol}//${u.host}`; } catch {} }
  return process.env.SITE_ORIGIN || "";
}
const buildHref = (origin, slug) => (origin ? origin.replace(/\/$/, "") + normSlug(slug) : slug);
function buildHreflangTags(enSlug, origin, cfg, slugMap) {
  const tags = [];
  const enHref = buildHref(origin, enSlug);
  tags.push({ hreflang: "x-default", href: enHref }, { hreflang: "en", href: enHref });
  for (const loc of cfg.locales) {
    const locSlug = slugMap[enSlug]?.[loc.code];
    if (locSlug) tags.push({ hreflang: loc.hreflang || loc.code, href: buildHref(origin, locSlug) });
  }
  return tags.map(t => `<link rel="alternate" hreflang="${t.hreflang}" href="${t.href}">`).join("\n  ");
}
function injectOrReplaceHreflang(html, block) {
  let cleaned = html.replace(/<link\s+rel=["']alternate["'][^>]*hreflang=["'][^"']+["'][^>]*>\s*/gi, "");
  if (cleaned.includes("{{hreflang_links}}")) return cleaned.replace("{{hreflang_links}}", block);
  return cleaned.replace(/<\/head>/i, `  ${block}\n</head>`);
}
function replaceLangAttr(html, lang) {
  if (html.match(/<html[^>]*\blang=/i)) return html.replace(/(<html[^>]*\blang=["'])[^"']*(["'][^>]*>)/i, `$1${lang}$2`);
  return html.replace(/<html/i, `<html lang="${lang}"`);
}
function replaceTitle(html, title) {
  if (html.match(/<title>.*<\/title>/is)) return html.replace(/<title>.*<\/title>/is, `<title>${title}</title>`);
  return html.replace(/<head>/i, `<head>\n  <title>${title}</title>`);
}
function upsertMetaDescription(html, desc) {
  if (html.match(/<meta\s+name=["']description["'][^>]*>/i)) return html.replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${desc}">`);
  return html.replace(/<title>.*<\/title>/is, m => `${m}\n  <meta name="description" content="${desc}">`);
}
function replaceH1(html, h1) {
  if (html.match(/<h1[^>]*>.*<\/h1>/is)) return html.replace(/<h1[^>]*>.*<\/h1>/is, `<h1>${h1}</h1>`);
  return html;
}
function localizeCommonUi(html, strings) {
  html = html.replace(/(<a[^>]*class=["'][^"']*\bcta\b[^"']*["'][^>]*>)(.*?)(<\/a>)/is, `$1${strings.cta_open_converter}$3`);
  html = html.replace(/(<section[^>]*class=["'][^"']*\bfaq\b[^"']*["'][^>]*\s+aria-label=["'])[^"']*(["'][^>]*>)/i, `$1${strings.faq_heading}$2`);
  html = html.replace(/(<section[^>]*class=["'][^"']*\bfaq\b[^"']*["'][^>]*>\s*<h2>)(.*?)(<\/h2>)/is, `$1${strings.faq_heading}$3`);
  html = html.replace(/(<section[^>]*class=["'][^"']*\brelated\b[^"']*["'][^>]*\s+aria-label=["'])[^"']*(["'][^>]*>)/i, `$1${strings.related_heading}$2`);
  html = html.replace(/(<section[^>]*class=["'][^"']*\brelated\b[^"']*["'][^>]*>\s*<h2>)(.*?)(<\/h2>)/is, `$1${strings.related_heading}$3`);
  html = html.replace(/(<footer[^>]*>[\s\S]*?<a[^>]*href=["']\/["'][^>]*>)(.*?)(<\/a>)/i, `$1${strings.home_label}$3`);
  if (html.match(/<noscript>[\s\S]*?<\/noscript>/i)) html = html.replace(/<noscript>[\s\S]*?<\/noscript>/i, strings.noscript_html);
  html = html.replace(/(<header[^>]*>[\s\S]*?<a[^>]*class=["'][^"']*\blogo\b[^"']*["'][^>]*>)(.*?)(<\/a>)/i, `$1${strings.site_name}$3`);
  return html;
}
function setCanonical(html, absoluteUrl) {
  if (!absoluteUrl) return html;
  if (html.match(/<link\s+rel=["']canonical["'][^>]*>/i)) return html.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${absoluteUrl}">`);
  return html.replace(/<\/head>/i, `  <link rel="canonical" href="${absoluteUrl}">\n</head>`);
}
const interpolate = (tpl, SRC, DST) => String(tpl || "").replaceAll("{SRC}", SRC).replaceAll("{DST}", DST);
const readStrings = locale => readJson(path.join(i18nRoot, "strings", `${locale}.json`));

const enSlugs = Object.keys(slugMap);
if (enSlugs.length === 0) { console.error("No entries in i18n/slug-map.json"); process.exit(1); }

for (const enSlug of enSlugs) {
  const enFile = fileFromSlug(enSlug);
  let html; try { html = await fs.readFile(enFile, "utf8"); } catch { console.warn("Skipping (missing EN page):", enSlug); continue; }
  const { src, dst } = parseSrcDstFromEnSlug(enSlug);
  const origin = getOriginFromHtml(html);
  const hreflangBlock = buildHreflangTags(enSlug, origin, cfg, slugMap);

  // Update EN with hreflang
  await fs.writeFile(enFile, injectOrReplaceHreflang(html, hreflangBlock), "utf8");

  // Localized variants
  for (const loc of cfg.locales) {
    const locSlug = slugMap[enSlug]?.[loc.code]; if (!locSlug) continue;
    const strings = await readStrings(loc.code);
    let locHtml = html;
    locHtml = replaceLangAttr(locHtml, strings.lang || loc.code);
    locHtml = replaceTitle(locHtml, interpolate(strings.title_tpl, src, dst));
    locHtml = upsertMetaDescription(locHtml, interpolate(strings.meta_description_tpl, src, dst));
    locHtml = replaceH1(locHtml, interpolate(strings.h1_tpl, src, dst));
    locHtml = localizeCommonUi(locHtml, strings);
    locHtml = setCanonical(locHtml, buildHref(origin, locSlug));
    locHtml = injectOrReplaceHreflang(locHtml, hreflangBlock);

    const outFile = fileFromSlug(locSlug);
    await fs.mkdir(path.dirname(outFile), { recursive: true });
    await fs.writeFile(outFile, locHtml, "utf8");
    console.log("Wrote", path.relative(projectRoot, outFile));
  }
}
console.log("i18n generation complete.");
