/* Tiny static file server for local verification only (not shipped).        */
/* Serves the repo root so http://localhost:PORT/ loads BRRRR_AI_Local.html.  */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";

const root = process.cwd();
const port = process.env.PORT || 3100;
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/BRRRR_AI_Local.html";
    const file = normalize(join(root, p));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end("forbidden"); }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log("static server on http://localhost:" + port));
