/**
 * JSON-LD builders (ESM).
 */

/** Extract {src,dst} from "/convert/avi-to-mp4" */
export function parseSrcDst(slug) {
  const m = String(slug || "").trim().match(/^\/convert\/([a-z0-9\-]+)-to-([a-z0-9\-]+)\/?$/);
  return m ? { src: m[1], dst: m[2] } : { src: null, dst: null };
}

/** Build BreadcrumbList JSON-LD for /convert/{src}-to-{dst} */
export function buildBreadcrumbJsonLd(opts) {
  const { slug, canonical = "" } = opts || {};
  const { src, dst } = parseSrcDst(slug);
  let origin;
  try {
    origin = canonical ? new URL(canonical).origin : (typeof window !== "undefined" ? window.location.origin : "");
  } catch {
    origin = "";
  }
  const list = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: origin ? origin + "/" : "/" },
      { "@type": "ListItem", position: 2, name: "Convert", item: origin ? origin + "/convert/" : "/convert/" },
      { "@type": "ListItem", position: 3, name: `${(src||"").toUpperCase()} to ${(dst||"").toUpperCase()}`, item: canonical || null }
    ]
  };
  if (!canonical) delete list.itemListElement[2].item;
  return JSON.stringify(list);
}

/** Build FAQ JSON-LD from CSV row */
export function buildFaqJsonLd(row) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: row.faq_q1, acceptedAnswer: { "@type": "Answer", text: row.faq_a1 } },
      { "@type": "Question", name: row.faq_q2, acceptedAnswer: { "@type": "Answer", text: row.faq_a2 } }
    ]
  });
}