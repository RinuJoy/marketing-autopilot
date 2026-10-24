// A tiny static server for an app's own checkout, so the video engine can open the real app in a browser without the
// live site. Like GitHub Pages: /x serves x.html when there is one, and any other page gets 404.html (or index.html),
// which a single-page app turns into the page its address names.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".wasm": "application/wasm", ".woff2": "font/woff2", ".txt": "text/plain", ".task": "application/octet-stream", ".tflite": "application/octet-stream" };
const isFile = f => stat(f).then(s => s.isFile(), () => false);

export async function serve(root) {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, path.endsWith("/") ? path + "index.html" : path);
    if (!await isFile(file)) {
      if (!extname(path) && await isFile(file + ".html")) file += ".html";
      else if (!extname(path) || path.endsWith(".html")) file = join(root, await isFile(join(root, "404.html")) ? "404.html" : "index.html");
      else { res.writeHead(404); res.end("not found"); return; }
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  }).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  return { server, base: `http://localhost:${server.address().port}/` };
}
