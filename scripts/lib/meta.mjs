/**
 * Metadata utility: builds <title>, meta description, robots, and OG/Twitter tags
 * with a consistent pattern and defensive escaping/length limits.
 */
import { parseSrcDst } from "./jsonld.mjs";

const MAX_TITLE = 65;          // keep SERP titles from truncating too often
const MAX_DESCRIPTION = 160;   // keep descriptions neat

export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function truncateNicely(raw = "", max = 160) {
  const s = String(raw || "").trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function defaultTitleFromSlug(slug = "") {
  const { src, dst } = parseSrcDst(slug);
  if (!src || !dst) return "";
  return `${src.toUpperCase()} to ${dst.toUpperCase()} — Fast, Private Converter (No Uploads)`;
}

function defaultDescriptionFromSlug(slug = "") {
  const { src, dst } = parseSrcDst(slug);
  if (!src || !dst) return "Free, fast, private in-browser file converter. No uploads.";
  return `Free ${src.toUpperCase()}→${dst.toUpperCase()} converter that runs in your browser — fast, private, no uploads.`;
}

/**
 * Build all meta for a CSV "row" with { slug, title, meta_description, canonical, og_image? }.
 * Returns escaped strings ready to drop into the HTML template.
 */
export function buildMetaForRow(row = {}) {
  const titleRaw = row.title && row.title.trim()
    ? row.title.trim()
    : defaultTitleFromSlug(row.slug);

  const descRaw = row.meta_description && row.meta_description.trim()
    ? row.meta_description.trim()
    : defaultDescriptionFromSlug(row.slug);

  const title = truncateNicely(titleRaw, MAX_TITLE);
  const description = truncateNicely(descRaw, MAX_DESCRIPTION);

  const robots = "index,follow,max-image-preview:large";

  const ogImage = (row.og_image && String(row.og_image).trim()) || "";
  const twitterCard = ogImage ? "summary_large_image" : "summary";

  const ogImageTag = ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : "";
  const twitterImageTag = ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : "";

  return {
    title,
    description,
    titleEsc: escapeHtml(title),
    descriptionEsc: escapeHtml(description),
    robots,
    twitterCard,
    ogImageTag,
    twitterImageTag
  };
}
