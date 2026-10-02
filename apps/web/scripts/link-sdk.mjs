// Workspace link: apps/web resolves @satchel/sdk to the SDK in this repo, so a change to packages/sdk is a change to the site.
import fs from "node:fs";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const link = path.join(here, "..", "node_modules", "@satchel", "sdk");
const target = path.join(here, "..", "..", "..", "packages", "sdk");
fs.mkdirSync(path.dirname(link), { recursive: true });
fs.rmSync(link, { recursive: true, force: true });
fs.symlinkSync(path.relative(path.dirname(link), target), link, "dir");
console.log(`linked ${link} -> ${target}`);
