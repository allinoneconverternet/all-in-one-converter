#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";

const root = process.cwd();
const csvPath = path.join(root, "seo-converter-landing-pages.csv");
const reportDir = path.join(root, "reports");
await fs.mkdir(reportDir, { recursive: true });

const port = 5173;
const server = spawn(process.execPath, [path.join(root, "scripts/mini-static-server.js"), String(port)], { stdio: "inherit" });
const base = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitUntilUp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok || res.status === 404) return;
    } catch {}
    await sleep(300);
  }
  throw new Error(`Static server did not start in time at ${url}`);
}

function isInternal(href) {
  try { const u = new URL(href, base); return u.origin === new URL(base).origin; }
  catch { return false; }
}
function normalize(u) {
  const url = new URL(u, base);
  url.hash = ""; url.search = "";
  if (url.pathname.endsWith("/")) url.pathname += "index.html";
  return url.toString();
}

async function crawl() {
  const toVisit = new Set([`${base}/`]);
  const seen = new Set();
  const titles = new Map();
  const problems = { errors: [], duplicates: [], missingLinks: [] };

  while (toVisit.size) {
    const url = [...toVisit][0]; toVisit.delete(url);
    if (seen.has(url)) continue; seen.add(url);

    const res = await fetch(url);
    if (!res.ok) { problems.errors.push({ url, status: res.status }); continue; }
    const html = await res.text();

    const m = html.match(/<title>(.*?)<\/title>/is);
    const title = m ? m[1].trim() : "";
    if (title) { const arr = titles.get(title) || []; arr.push(url); titles.set(title, arr); }

    const linkRe = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let lm; while ((lm = linkRe.exec(html))) {
      const href = lm[1];
      if (!isInternal(href)) continue;
      const abs = normalize(new URL(href, url).toString());
      if (!seen.has(abs)) toVisit.add(abs);
    }
  }

  for (const [t, urls] of titles) if (urls.length > 1) problems.duplicates.push({ title: t, urls });

  const csv = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(csv, { columns: true, skip_empty_lines: true });
  const slugs = rows.map(r => String(r.slug||"").trim()).filter(Boolean);
  const discovered = [...seen].map(u => new URL(u).pathname.replace(/\/index\.html$/,""));
  for (const slug of slugs) if (!discovered.includes(slug)) problems.missingLinks.push({ slug });

  const json = { summary: { pagesCrawled: seen.size, errors: problems.errors.length, duplicateTitleGroups: problems.duplicates.length, missingLinks: problems.missingLinks.length }, ...problems };
  await fs.writeFile(path.join(reportDir, "qa-report.json"), JSON.stringify(json, null, 2), "utf8");
  const csvOut = [
    "type,url_or_slug,extra",
    ...problems.errors.map(e => `error,${e.url},${e.status}`),
    ...problems.duplicates.flatMap(d => d.urls.map(u => `duplicate_title,${u},"${d.title.replace(/"/g,'""')}"`)),
    ...problems.missingLinks.map(m => `missing_link,${m.slug},`)
  ].join("\n");
  await fs.writeFile(path.join(reportDir, "qa-report.csv"), csvOut, "utf8");

  return problems;
}

process.on("SIGINT", () => server.kill());
process.on("exit", () => server.kill());

try {
  await waitUntilUp(`${base}/`);
  const probs = await crawl();
  server.kill();
  if (probs.errors.length || probs.missingLinks.length) { console.error("QA failed:", probs); process.exit(1); }
  else { console.log("QA OK"); }
} catch (e) {
  server.kill(); console.error(e); process.exit(1);
}
