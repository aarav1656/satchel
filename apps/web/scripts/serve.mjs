// Serves the static export in out/ exactly as a CDN would: files only, directory index.html, no server code.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "out");
const port = Number(process.argv[2] ?? 5190);
if (!fs.existsSync(path.join(root, "index.html"))) throw new Error(`no export at ${root}: run bun run build`);

Bun.serve({
  port,
  hostname: "localhost",
  fetch(req) {
    const url = new URL(req.url);
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (!p.startsWith(root)) return new Response("forbidden", { status: 403 });
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) return new Response(Bun.file(path.join(root, "404.html")), { status: 404 });
    return new Response(Bun.file(p));
  },
});
console.log(`serving ${root} on http://localhost:${port}`);
