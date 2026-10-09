// Serves the static export twice (App A and App B origins) plus the note bus.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
const out = path.join(web, "out");
if (!fs.existsSync(path.join(out, "index.html"))) {
  console.error("run NEXT_PUBLIC_NOTE_BUS=http://127.0.0.1:5193 bun run build first");
  process.exit(1);
}

const pipPort = Number(process.env.PIP_PORT ?? 5190);
const fernPort = Number(process.env.FERN_PORT ?? 5191);
const busPort = Number(process.env.BUS_PORT ?? 5193);

const serve = (port) =>
  spawn(process.execPath, [path.join(web, "scripts/serve.mjs"), String(port)], {
    stdio: "inherit",
    cwd: web,
  });
const bus = spawn(process.execPath, [path.join(web, "scripts/note-bus.mjs"), String(busPort)], { stdio: "inherit", cwd: web });

const pip = serve(pipPort);
const fern = serve(fernPort);

console.log(`App A (Pip): http://127.0.0.1:${pipPort}/pip/  (or http://satchel.localhost:${pipPort}/pip/)`);
console.log(`App B (Fern): http://127.0.0.1:${fernPort}/fern/  (or http://fern.satchel.localhost:${fernPort}/fern/)`);
console.log(`Note bus: http://127.0.0.1:${busPort}/v1/notes`);

const stop = () => {
  pip.kill();
  fern.kill();
  bus.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
