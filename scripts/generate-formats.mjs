#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PAIRS = path.join(root, "seo-converter-landing-pages.csv");
const OVERRIDES = path.join(root, "data", "formats.csv");
const TEMPLATE = path.join(root, "templates", "format-page.template.html");
const OUT = path.join(root, "formats");
const EXAMPLES = path.join(root, "examples", "formats");

const stripBOM = (s) => String(s).replace(/^\uFEFF/, "");
const args = new Set(process.argv.slice(2));

const CATEGORIES = {
  image: ["jpg","jpeg","png","gif","webp","bmp","tiff","tif","svg","avif","heic","heif","cr2","dng","raw","psd","ai","eps"],
  audio: ["mp3","wav","aac","flac","ogg","oga","aiff","wma"],
  video: ["mp4","mov","mkv","avi","webm","wmv","flv","3gp"],
  document: ["pdf","doc","docx","rtf","txt","odt","djvu","epub","azw3"],
  spreadsheet: ["csv","xls","xlsx","ods"],
  presentation: ["ppt","pptx","odp"],
  archive: ["zip","7z","rar"],
  ebook: ["epub","azw3","mobi","djvu"],
  font: ["ttf","otf","woff","woff2"]
};

const MIME_MAP = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif",
  bmp: "image/bmp", tiff: "image/tiff", tif: "image/tiff", svg: "image/svg+xml", heic: "image/heic", heif: "image/heif",
  cr2: "image/x-canon-cr2", dng: "image/x-adobe-dng", raw: "image/x-raw", psd: "image/vnd.adobe.photoshop",
  ai: "application/postscript", eps: "application/postscript",
  mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", webm: "video/webm", wmv: "video/x-ms-wmv", flv: "video/x-flv", "3gp": "video/3gpp",
  mp3: "audio/mpeg", wav: "audio/wav", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", aiff: "audio/aiff", wma: "audio/x-ms-wma",
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf", txt: "text/plain; charset=utf-8",
  epub: "application/epub+zip", azw3: "application/vnd.amazon.ebook",
  csv: "text/csv; charset=utf-8", xls: "application/vnd.ms-excel", xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:"application/vnd.ms-powerpoint", pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip:"application/zip", "7z":"application/x-7z-compressed", rar:"application/vnd.rar",
  ttf:"font/ttf", otf:"font/otf", woff:"font/woff", woff2:"font/woff2",
  apk:"application/vnd.android.package-archive",
  djvu:"image/vnd.djvu"
};

function categorize(ext) {
  ext = String(ext || "").toLowerCase();
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (list.includes(ext)) return cat;
  }
  return "file";
}
function escapeHtml(s=""){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}
function htmlList(items=[]){return `<ul>\n${items.map(i=>`<li>${i}</li>`).join("\n")}\n</ul>`}
function truncate(s,max=160){s=String(s||"").trim().replace(/\s+/g," ");if(s.length<=max)return s;const cut=s.slice(0,max-1);const last=cut.lastIndexOf(" ");return (last>40?cut.slice(0,last):cut).trimEnd()+"…"}
async function ensureDir(p){await fs.mkdir(p,{recursive:true})}
function siteOrigin(){const o=process.env.SITE_ORIGIN; if(!o) return ""; try{return new URL(o).origin}catch{return ""}}
function breadcrumbsJsonLd(canonical, ext){
  let origin=""; try{origin=canonical?new URL(canonical).origin:""}catch{}
  const data={"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
    {"@type":"ListItem","position":1,"name":"Home","item":origin?origin+"/":"/"},
    {"@type":"ListItem","position":2,"name":"Formats","item":origin?origin+"/formats/":"/formats/"},
    {"@type":"ListItem","position":3,"name":ext.toUpperCase(),"item":canonical || null}
  ]};
  if(!canonical) delete data.itemListElement[2].item;
  return JSON.stringify(data, null, 2);
}

async function readCsvIfPresent(p){
  try {
    const raw = await fs.readFile(p, "utf8");
    return parseCsv(stripBOM(raw), { columns:true, skip_empty_lines:true, bom:true });
  } catch { return [] }
}

async function main(){
  if (args.has("--clean")) {
    await fs.rm(OUT, { recursive:true, force:true });
    await fs.rm(EXAMPLES, { recursive:true, force:true });
    console.log("Cleaned formats outputs");
    return;
  }

  const pairsRaw = await fs.readFile(PAIRS, "utf8");
  const pairs = parseCsv(stripBOM(pairsRaw), { columns:true, skip_empty_lines:true, bom:true });

  const exts = new Set();
  const outgoing = new Map(); // src -> [{slug,label}]
  const incoming = new Map(); // dst -> [{slug,label}]

  for (const row of pairs) {
    const m = String(row.slug).trim().match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)\/?$/);
    if (!m) continue;
    const [_, src, dst] = m;
    exts.add(src); exts.add(dst);
    const label = escapeHtml(row.primary_keyword || `${src.toUpperCase()} to ${dst.toUpperCase()} converter`);
    (outgoing.get(src) || outgoing.set(src, []).get(src)).push({ slug: row.slug, label });
    (incoming.get(dst) || incoming.set(dst, []).get(dst)).push({ slug: row.slug, label });
  }

  const overridesRows = await readCsvIfPresent(OVERRIDES);
  const overrides = {};
  for (const r of overridesRows) {
    const e = String(r.ext||"").toLowerCase().trim();
    if (e) overrides[e] = r;
  }

  await ensureDir(OUT);
  const origin = siteOrigin();

  for (const ext of Array.from(exts).sort()) {
    const ov = overrides[ext] || {};
    const name = (ov.name || ext.toUpperCase()).trim();
    const cat = ov.category || categorize(ext);
    const mime = ov.mime || MIME_MAP[ext] || "application/octet-stream";
    const def = ov.definition || (cat==="image" ? `A raster or vector image saved with the .${ext} extension.`
      : cat==="video" ? `A digital video container or codec with the .${ext} extension.`
      : cat==="audio" ? `An audio format with the .${ext} file extension.`
      : cat==="document" ? `A document format that uses the .${ext} extension.`
      : cat==="spreadsheet" ? `A spreadsheet format that uses the .${ext} extension.`
      : cat==="presentation" ? `A presentation format that uses the .${ext} extension.`
      : cat==="archive" ? `A compressed archive using the .${ext} file extension.`
      : cat==="font" ? `A font file delivered as .${ext}.`
      : `A file that uses the .${ext} extension.`);

    const open = (ov.open_methods||"").split(/\s*;\s*/).filter(Boolean);
    const openFallback = cat==="image" ? ["Any modern web browser","macOS Preview","Windows Photos","GIMP, Photoshop"]
      : cat==="video" ? ["VLC media player","mpv","QuickTime (macOS)"]
      : cat==="audio" ? ["VLC media player","Audacity","iTunes/Music app"]
      : cat==="document" ? ["Microsoft Office","LibreOffice","Google Drive (view)"]
      : cat==="spreadsheet" ? ["Microsoft Excel","LibreOffice Calc","Google Sheets (import)"]
      : cat==="presentation" ? ["Microsoft PowerPoint","LibreOffice Impress","Google Slides (import)"]
      : cat==="archive" ? ["7-Zip","The Unarchiver (macOS)","WinRAR/WinZip"]
      : cat==="font" ? ["System font manager","Font Book (macOS)"]
      : ["A compatible desktop app"];

    const pros = (ov.pros||"").split(/\s*;\s*/).filter(Boolean);
    const cons = (ov.cons||"").split(/\s*;\s*/).filter(Boolean);
    const prosFallback = cat==="image" ? ["Wide software support","Good balance of quality and size (varies by format)"]
      : cat==="video" ? ["Hardware-accelerated playback (for common codecs)","Good web/browser compatibility"]
      : cat==="audio" ? ["Good quality at smaller sizes (lossy) or perfect copies (lossless)"]
      : cat==="document" ? ["Easy to share and print","Supports formatting and images"]
      : cat==="spreadsheet" ? ["Tabular data with formulas","Interoperable with major suites"]
      : cat==="presentation" ? ["Rich slides with media","Works across office suites"]
      : cat==="archive" ? ["Compress many files into one","Checksum and error recovery (varies)"]
      : cat==="font" ? ["Embeddable on the web (WOFF/WOFF2)","Cross-platform"]
      : ["Common and easy to open"];
    const consFallback = cat==="image" ? ["Quality loss for lossy formats","Large sizes for lossless/RAW"]
      : cat==="video" ? ["Licensing/codec issues (some formats)","Large file sizes"]
      : cat==="audio" ? ["Lossy formats discard data","Compatibility quirks for some codecs"]
      : cat==="document" ? ["Layout can break across apps (editable formats)","Potential compatibility mismatches"]
      : cat==="spreadsheet" ? ["Feature mismatch across suites","Corruption risk in complex files"]
      : cat==="presentation" ? ["Large media-heavy decks","Fonts may not embed"]
      : cat==="archive" ? ["Corruption affects whole archive","Proprietary features in some types"]
      : cat==="font" ? ["Rendering differences across platforms","Licensing restrictions"]
      : ["May require specific software"];

    const toLinks = (outgoing.get(ext)||[]).slice(0,16);
    const fromLinks = (incoming.get(ext)||[]).slice(0,16);

    const tpl = await fs.readFile(TEMPLATE, "utf8");
    const title = `${name} file (.${ext}) — What it is & how to open`;
    const desc = truncate(`Learn about .${ext} files: what they are, how to open them, MIME type (${mime}), pros/cons, and common conversions.`);
    const canonical = origin ? `${origin}/formats/${ext}/` : "";
    const h1 = `${name} (.${ext})`;

    const html = tpl
      .replaceAll("{{title}}", escapeHtml(title))
      .replaceAll("{{meta_description}}", escapeHtml(desc))
      .replaceAll("{{robots}}", "index,follow")
      .replaceAll("{{canonical}}", escapeHtml(canonical))
      .replaceAll("{{h1}}", escapeHtml(h1))
      .replaceAll("{{definition}}", escapeHtml(def))
      .replaceAll("{{ext}}", escapeHtml(ext))
      .replaceAll("{{category}}", escapeHtml(cat))
      .replaceAll("{{mime}}", escapeHtml(mime))
      .replaceAll("{{open_methods_html}}", htmlList(open.length ? open : openFallback))
      .replaceAll("{{pros_html}}", htmlList(pros.length ? pros : prosFallback))
      .replaceAll("{{cons_html}}", htmlList(cons.length ? cons : consFallback))
      .replaceAll("{{to_links}}", toLinks.map(r=>`<li><a href="${r.slug}">${r.label}</a></li>`).join("\n"))
      .replaceAll("{{from_links}}", fromLinks.map(r=>`<li><a href="${r.slug}">${r.label}</a></li>`).join("\n"))
      .replace("{{breadcrumbs_jsonld}}", breadcrumbsJsonLd(canonical, ext))
      .replaceAll("{{sample_href}}", `/examples/formats/${ext}/sample.${ext}`);

    const sampleDir = path.join(EXAMPLES, ext);
    await ensureDir(sampleDir);
    const textish = ["txt","csv","json","xml","svg","html","rtf"].includes(ext) || ["document","spreadsheet","presentation"].includes(cat);
    const samplePath = path.join(sampleDir, `sample.${ext}`);
const data = textish ? `Placeholder sample .${ext}` + "\n" : new Uint8Array();
await fs.writeFile(samplePath, data, textish ? "utf8" : undefined);
const outDir = path.join(OUT, ext);
    await ensureDir(outDir);
    await fs.writeFile(path.join(outDir, "index.html"), html, "utf8");
    console.log(`Wrote formats/${ext}/index.html`);
  }

  console.log("Format pages done.");
}

main().catch(err => { console.error(err); process.exit(1); });
