/**
 * Link-cluster utility — deterministic related conversions from CSV rows.
 * ESM module.
 */
export function parseSlug(slug = "") {
  const m = String(slug).trim().match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)\/?$/);
  return m ? { src: m[1], dst: m[2] } : { src: null, dst: null };
}

/** Build a format index to speed up lookups */
export function buildIndex(rows) {
  const bySlug = new Map();
  const bySrc = new Map();
  const byDst = new Map();
  for (const r of rows) {
    bySlug.set(r.slug, r);
    const { src, dst } = parseSlug(r.slug);
    if (!src || !dst) continue;
    (bySrc.get(src) || bySrc.set(src, []).get(src)).push(r);
    (byDst.get(dst) || byDst.set(dst, []).get(dst)).push(r);
  }
  return { bySlug, bySrc, byDst };
}

/**
 * Score candidate row relative to current pair (A->B).
 * Deterministic, no randomness. Higher is better.
 */
export function scoreCandidate(currentSlug, candidateSlug) {
  const { src: A, dst: B } = parseSlug(currentSlug);
  const { src: s, dst: d } = parseSlug(candidateSlug);
  if (!A || !B || !s || !d) return -1;
  let score = 0;
  if (s === B && d === A) score += 100; // reverse
  if (s === A) score += 50;             // same source (A -> *)
  if (d === B) score += 30;             // same target (* -> B)
  if (s === B) score += 20;             // target as source (B -> *)
  if (d === A) score += 10;             // source as target (* -> A)
  if (s === A || d === B || s === B || d === A) score += 1;
  return score;
}

/**
 * Compute a deterministic cluster for a given row.
 * - Returns 6..12 items (best effort).
 * - Puts the reverse conversion first if present.
 */
export function buildCluster(rows, currentRow, min = 6, max = 12) {
  const currentSlug = currentRow.slug;
  const scored = [];
  for (const r of rows) {
    if (r === currentRow) continue;
    const s = scoreCandidate(currentSlug, r.slug);
    if (s <= 0) continue;
    scored.push({ row: r, s });
  }
  scored.sort((a, b) => (b.s - a.s) || String(a.row.slug).localeCompare(String(b.row.slug)));

  const { src, dst } = parseSlug(currentSlug);
  const reverseSlug = src && dst ? `/convert/${dst}-to-${src}` : null;

  const out = [];
  for (const item of scored) {
    if (reverseSlug && item.row.slug === reverseSlug) continue;
    out.push(item.row);
  }
  // Prepend reverse if exists
  const rev = scored.find(it => it.row.slug === reverseSlug);
  if (rev) out.unshift(rev.row);

  const trimmed = out.slice(0, max);
  return trimmed.length >= min ? trimmed : trimmed;
}

/** Generate <li><a>…</a></li> HTML for a cluster (escaped) */
export function renderClusterList(clusterRows) {
  return clusterRows
    .map(r => `<li><a href="${escapeHtml(r.slug)}">${escapeHtml(r.primary_keyword)}</a></li>`)
    .join("\n        ");
}

/** Minimal escape */
export function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
