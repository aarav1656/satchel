// bun scripts/check-built.mjs  (runs as `postbuild`): reads the static export in out/ and fails on drift between what the site
// shows and what the code does.
//  1. The quickstart text on / is the QUICKSTART constant, the text shipped in the client bundle that the Run button executes is
//     the same constant, and QuickstartRun.tsx runs that constant rather than a copy.
//  2. Every function the docs name in code is a real export or member of satchel-sdk, or is on a short list of other libraries' names.
//  3. The error table and the error entries list the same codes and the same "Thrown by" names, and match the SDK's ErrorCode.
import fs from "node:fs";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
const out = path.join(web, "out");
const sdk = path.resolve(web, "..", "..", "packages", "sdk", "dist");
const failures = [];
const fail = (m) => failures.push(m);
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html) => decode(html.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, ""));
const page = (route) => fs.readFileSync(path.join(out, route, "index.html"), "utf8");
if (!fs.existsSync(path.join(out, "index.html"))) throw new Error("no export in out/: run bun run build");

// 1. quickstart
const { QUICKSTART } = await import("../lib/snippets.ts");
const home = page("");
const block = home.match(/data-snippet="quickstart">[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
if (!block) fail("the quickstart code block (data-snippet=quickstart) is missing from /");
else if (text(block[1]) !== QUICKSTART) fail(`the quickstart shown on / differs from lib/snippets.ts QUICKSTART:\n--- page\n${text(block[1])}\n--- source\n${QUICKSTART}`);
const run = fs.readFileSync(path.join(web, "components", "QuickstartRun.tsx"), "utf8");
if (!/import \{ QUICKSTART \} from "@\/lib\/snippets";/.test(run) || !/runSnippet\(QUICKSTART,/.test(run)) fail("QuickstartRun.tsx does not run the QUICKSTART constant from lib/snippets.ts");
if (/\.seal\(|\bns\(|openOrEnrol\(/.test(run)) fail("QuickstartRun.tsx carries its own SDK calls instead of running the snippet");
const chunks = path.join(out, "_next", "static", "chunks");
const first = QUICKSTART.split("\n")[0];
let shipped;
for (const f of fs.readdirSync(chunks).filter((n) => n.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(chunks, f), "utf8");
  const i = src.indexOf(first);
  if (i < 0) continue;
  const start = src.lastIndexOf("`", i);
  const end = src.indexOf("`", i);
  // the template literal as the bundle wrote it, evaluated back to the string the Run button executes
  shipped = new Function(`return \`${src.slice(start + 1, end)}\``)();
  break;
}
if (shipped === undefined) fail("the QUICKSTART text is not in any client chunk, so the Run button cannot be executing it");
else if (shipped !== QUICKSTART) fail("the QUICKSTART string in the client bundle differs from lib/snippets.ts");

// 2. names
const dts = (f) => fs.readFileSync(path.join(sdk, f), "utf8");
const members = (file, iface) => [...(dts(file).match(new RegExp(`interface ${iface}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "").matchAll(/^    (?:readonly )?(\w+)\s*[(<:]/gm)].map((m) => m[1]);
const roots = new Set();
for (const m of dts("index.d.ts").matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) for (const p of m[1].split(",")) roots.add(p.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop());
const satchel = new Set(members("session.d.ts", "Satchel"));
const reader = new Set(members("grant.d.ts", "Reader"));
const known = new Set([...roots, ...satchel, ...reader, ...members("sealed.d.ts", "Sealed"), "reader"]);
if (roots.size < 15 || satchel.size < 9 || reader.size < 2 || !known.has("regrant") || !known.has("fetchGrant")) fail(`name sets look wrong: ${roots.size} roots, ${satchel.size} Satchel members, ${reader.size} Reader members`);
/** Names of other libraries and the platform that the docs call in code. Anything else with () must be satchel's. */
const OTHER = new Set(["fetch", "getBytes", "parseSecretVault", "decryptSecretVaultWithPasskey", "createSecretVaultWithExistingPasskey", "isMeraError", "resealLegacy", "readNotes", "sealNote", "openNote", "explainSeal", "idbGet", "idbPut", "satchel", "forge", "cast", "get", "put", "TextDecoder", "arrayBuffer"]);
const routes = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === "_next" || e.name === "evidence") continue;
    if (e.isDirectory()) walk(path.join(d, e.name));
    else if (e.name === "index.html") routes.push(path.relative(out, d));
  }
};
walk(out);
if (routes.length < 12) fail(`only ${routes.length} routes found in out/`);
let codeNames = 0;
for (const r of routes) {
  const html = page(r);
  const code = [...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((m) => text(m[1]));
  const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => text(m[1]));
  for (const t of [...code, ...pres]) {
    for (const m of t.matchAll(/\b([A-Za-z_]\w*)\(\)/g)) {
      codeNames++;
      if (!known.has(m[1]) && !OTHER.has(m[1])) fail(`/${r}: code names ${m[1]}(), which satchel-sdk does not export`);
    }
  }
  for (const t of pres) {
    for (const imp of t.matchAll(/import \{([^}]*)\} from "satchel-sdk"/g)) {
      for (const n of imp[1].split(",").map((x) => x.trim().replace(/^type\s+/, "")).filter(Boolean)) if (!roots.has(n)) fail(`/${r}: imports ${n} from satchel-sdk, which it does not export`);
    }
    for (const m of t.matchAll(/(?<![\w.])s\.(\w+)\(/g)) if (!satchel.has(m[1])) fail(`/${r}: s.${m[1]}() is not a member of Satchel`);
    for (const m of t.matchAll(/\.reader\([^)]*\)\.(\w+)\(|(?<![\w.])reader\.(\w+)\(/g)) if (!reader.has(m[1] ?? m[2])) fail(`/${r}: reader.${m[1] ?? m[2]}() is not a member of Reader`);
  }
}
if (codeNames < 20) fail(`only ${codeNames} function names were checked in the docs, the scan is not reading them`);

// 3. error table
const errors = page("reference/errors");
const rows = [...errors.matchAll(/<tr data-testid="error-summary-row" data-code="([A-Z_]+)">[\s\S]*?<td class="muted">([\s\S]*?)<\/td><\/tr>/g)].map((m) => [m[1], text(m[2]).trim()]);
const details = [...errors.matchAll(/<article[^>]*data-testid="error-detail" data-code="([A-Z_]+)"[\s\S]*?<\/article>/g)].map((m) => {
  const by = m[0].match(/<p class="small muted">Thrown by ([\s\S]*?)\.<\/p>/);
  return [m[1], by ? text(by[1]).trim() : "(missing)"];
});
const codes = [...dts("errors.d.ts").match(/type ErrorCode =([^;]*);/)[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
if (codes.length < 19) fail(`parsed only ${codes.length} error codes`);
if (rows.length !== codes.length) fail(`the error table has ${rows.length} rows for ${codes.length} ErrorCodes`);
if (details.length !== codes.length) fail(`the error page has ${details.length} entries for ${codes.length} ErrorCodes`);
for (const c of codes) {
  const r = rows.find((x) => x[0] === c);
  const d = details.find((x) => x[0] === c);
  if (!r || !d) fail(`${c} is missing from the table or the entries`);
  else if (r[1] !== d[1]) fail(`${c}: table says "${r[1]}", entry says "${d[1]}"`);
}

if (failures.length) {
  console.error(`check-built FAIL (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`check-built ok: quickstart on / === QUICKSTART === the shipped Run source (${QUICKSTART.split("\n").length} lines); ${codeNames} function names in docs code checked against ${known.size} real names; ${rows.length} error table rows agree with ${details.length} entries and ${codes.length} ErrorCodes`);
