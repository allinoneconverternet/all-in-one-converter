#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { parse as parseCsv } from "csv-parse/sync";
import { buildBreadcrumbJsonLd } from "../scripts/lib/jsonld.mjs";

const stripBOM = (s) => s.replace(/^\uFEFF/, "");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const csvPath = path.join(projectRoot, "seo-converter-landing-pages.csv");
const snapRoot = path.join(projectRoot, "tests", "snapshots", "breadcrumbs");

const csv = stripBOM(await fs.readFile(csvPath, "utf8"));
const records = parseCsv(csv, { columns: true, skip_empty_lines: true });
if (!records.length) throw new Error("CSV appears empty");

const samples = records.slice(0, 3);

for (const row of samples) {
  const json = JSON.parse(buildBreadcrumbJsonLd({ canonical: row.canonical, slug: row.slug }));
  const snapFile = row.slug.replace(/^\/convert\//, "") + ".json";
  const snapPath = path.join(snapRoot, snapFile);
  const expected = JSON.parse(stripBOM(await fs.readFile(snapPath, "utf8")));
  assert.deepEqual(json, expected, "Breadcrumb JSON-LD does not match snapshot for " + row.slug);
  console.log("✓", row.slug);
}

console.log("\nAll breadcrumb snapshots match.");