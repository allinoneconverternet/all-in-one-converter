const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.argv[2] || process.env.PORT || 5173);
const root = process.cwd();

const mime = {
  ".html":"text/html",".js":"application/javascript",".css":"text/css",
  ".json":"application/json",".svg":"image/svg+xml",".png":"image/png",
  ".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon",".webmanifest":"application/manifest+json",".wasm":"application/wasm"};

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const filePath = path.join(root, urlPath);
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) { res.statusCode = 404; res.end("Not found"); return; }
      res.setHeader("Content-Type", mime[path.extname(filePath).toLowerCase()] || "application/octet-stream");
      fs.createReadStream(filePath).pipe(res);
    });
  } catch {
    res.statusCode = 500; res.end("error");
  }
});
server.listen(port, () => console.log("LISTENING", port));



