// Ciphertext-only note bus for the two-origin demo. Pip PUTs sealed rows; Fern GETs them from another port.
import fs from "node:fs";
import path from "node:path";

const port = Number(process.argv[2] ?? 5193);
const file = path.join(import.meta.dirname, "..", ".note-bus.json");
const read = () => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
};
const write = (notes) => fs.writeFileSync(file, JSON.stringify(notes));

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, OPTIONS",
  "access-control-allow-headers": "content-type",
};

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (url.pathname === "/v1/notes") {
      if (req.method === "GET") {
        return Response.json(read(), { headers: cors });
      }
      if (req.method === "PUT") {
        return req.json().then((body) => {
          if (!Array.isArray(body)) return new Response("expected array", { status: 400, headers: cors });
          write(body);
          return new Response("ok", { headers: cors });
        });
      }
    }
    return new Response("not found", { status: 404, headers: cors });
  },
});
console.log(`note bus on http://127.0.0.1:${port}/v1/notes`);
