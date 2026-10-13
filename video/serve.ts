// bun video/serve.ts [port] : the static export in apps/web/out plus the real chat function at POST /api/chat.
// OPENROUTER_API_KEY comes from the inherited environment and is never read or printed here.
import fs from "node:fs";
import path from "node:path";
import { POST } from "../api/chat.ts";

const root = path.resolve(import.meta.dirname, "..", "apps", "web", "out");
const port = Number(process.argv[2] ?? 5291);
if (!fs.existsSync(path.join(root, "index.html"))) throw new Error(`no export at ${root}: run bun run build in apps/web`);

Bun.serve({
  port,
  hostname: "localhost",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/chat") return req.method === "POST" ? POST(req) : new Response("method not allowed", { status: 405 });
    let p = path.join(root, decodeURIComponent(url.pathname));
    if (!p.startsWith(root)) return new Response("forbidden", { status: 403 });
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) return new Response(Bun.file(path.join(root, "404.html")), { status: 404 });
    return new Response(Bun.file(p));
  },
});
console.log(`serving ${root} with /api/chat on http://localhost:${port}`);
