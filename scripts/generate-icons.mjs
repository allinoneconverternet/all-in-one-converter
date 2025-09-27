#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import favicons from "favicons";
const root = process.cwd();
const src = path.join(root, "assets", "logo.svg");
try { await fs.access(src); }
catch {
  await fs.mkdir(path.dirname(src), { recursive: true });
  await fs.writeFile(src, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="100%" height="100%" fill="#0b1020"/><text x="50%" y="55%" font-size="240" text-anchor="middle" fill="#6ea8fe" font-family="system-ui">C</text></svg>`);
}
const cfg = { path: "/", appName: "All-in-One Converter", appShortName: "Converter", background: "#0b1020", theme_color: "#0b1020", start_url: "/", icons: { favicons: true, appleIcon: true, android: true } };
const res = await favicons(src, cfg);
for (const img of res.images) await fs.writeFile(path.join(root, img.name), img.contents);
for (const f of res.files) await fs.writeFile(path.join(root, f.name), f.contents);
async function ensure(src, dest) { try { await fs.copyFile(path.join(root, src), path.join(root, dest)); } catch {} }
await ensure("favicon-32x32.png","favicon-32x32.png");
await ensure("favicon-16x16.png","favicon-16x16.png");
await ensure("apple-touch-icon.png","apple-touch-icon.png");
await ensure("android-chrome-192x192.png","android-chrome-192x192.png");
await ensure("android-chrome-512x512.png","android-chrome-512x512.png");
console.log("Icons generated");
