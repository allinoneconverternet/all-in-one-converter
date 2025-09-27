import fs from "node:fs";
const f = "package.json";
const raw = fs.readFileSync(f, "utf8").replace(/^\uFEFF/, "");
const j = JSON.parse(raw);
j.scripts ??= {};
j.scripts["generate:formats"] = "node scripts/generate-formats.mjs --all";
j.scripts["build"] = "npm run generate:clean && npm run generate:all && npm run generate:formats && npm run generate:i18n && npm run generate:sitemaps";
fs.writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
console.log("package.json updated");
