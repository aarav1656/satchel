// Runs before `next build`. Everything the site states about the SDK, the registry and its evidence is checked here, so the
// docs cannot drift from the code: a mismatch exits 1 and the build does not start.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const web = path.resolve(import.meta.dirname, "..");
const repo = path.resolve(web, "..", "..");
const sdk = path.join(repo, "packages", "sdk");
const fail = (msg) => {
  console.error(`prebuild FAIL: ${msg}`);
  process.exit(1);
};
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"] });

run("bun", ["scripts/link-sdk.mjs"], web);
run("bun", ["run", "build"], sdk);

// 1. Every root export of the SDK has a reference entry, and every entry names a real export or Satchel/Reader member.
const { ENTRIES } = await import("../lib/reference.ts");
const { ERROR_DOCS } = await import("../lib/error-docs.ts");
const index = fs.readFileSync(path.join(sdk, "dist", "index.d.ts"), "utf8");
const exported = new Set();
for (const m of index.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
  for (const part of m[1].split(",")) {
    const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
    if (name) exported.add(name);
  }
}
if (exported.size < 10) fail(`parsed only ${exported.size} exports from dist/index.d.ts`);
const members = (file, iface) => {
  const src = fs.readFileSync(path.join(sdk, "dist", file), "utf8");
  const body = src.match(new RegExp(`interface ${iface}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) fail(`interface ${iface} not found in dist/${file}`);
  return [...body.matchAll(/^    (?:readonly )?(\w+)\s*[(<:]/gm)].map((m) => m[1]);
};
const satchelMembers = members("session.d.ts", "Satchel");
const readerMembers = members("grant.d.ts", "Reader");
const wantedMethods = new Set([
  ...satchelMembers.filter((n) => !["credential", "registryOwner"].includes(n)).map((n) => `Satchel.${n}`),
  ...readerMembers.map((n) => `Reader.${n}`),
]);
const entryNames = new Set(ENTRIES.map((e) => e.name));
const missing = [...exported, ...wantedMethods].filter((n) => !entryNames.has(n));
const extra = ENTRIES.map((e) => e.name).filter((n) => !exported.has(n) && !wantedMethods.has(n));
if (missing.length) fail(`exports with no reference entry: ${missing.join(", ")}`);
if (extra.length) fail(`reference entries with no export: ${extra.join(", ")}`);
for (const e of ENTRIES) {
  if ((e.kind === "function" || e.kind === "method") && e.throws === undefined) fail(`${e.name} has no Throws line`);
}

// 2. The error table: codes come from the SDK type, each has authored text, each is thrown by a documented function and exists in the source.
const errorsDts = fs.readFileSync(path.join(sdk, "dist", "errors.d.ts"), "utf8");
const codes = [...errorsDts.match(/type ErrorCode =([^;]*);/)[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
if (codes.length < 10) fail(`parsed only ${codes.length} error codes`);
const src = fs.readdirSync(path.join(sdk, "src")).map((f) => fs.readFileSync(path.join(sdk, "src", f), "utf8")).join("\n");
for (const c of codes) {
  if (!(c in ERROR_DOCS)) fail(`ErrorCode ${c} has no entry in lib/error-docs.ts`);
  if (!ENTRIES.some((e) => e.throws?.includes(c))) fail(`ErrorCode ${c} is in no function's Throws line`);
  if (!src.includes(`"${c}"`)) fail(`ErrorCode ${c} is never thrown in packages/sdk/src`);
}
for (const c of Object.keys(ERROR_DOCS)) if (!codes.includes(c)) fail(`lib/error-docs.ts documents ${c}, which the SDK no longer has`);
for (const e of ENTRIES) for (const c of e.throws ?? []) if (!codes.includes(c)) fail(`${e.name} throws ${c}, which is not an ErrorCode`);

// 3. The registry the site talks to is the deployed one, and its ABI has what the site calls.
const dep = JSON.parse(fs.readFileSync(path.join(repo, "deployments", "testnet.json"), "utf8"));
const { REGISTRY_ADDRESS } = await import("../lib/config.ts");
if (REGISTRY_ADDRESS.toLowerCase() !== dep.address.toLowerCase()) fail(`lib/config.ts registry ${REGISTRY_ADDRESS} differs from deployments/testnet.json ${dep.address}`);
const abi = JSON.parse(fs.readFileSync(path.join(repo, "deployments", "SatchelRegistry.abi.json"), "utf8"));
const abiList = Array.isArray(abi) ? abi : abi.abi;
for (const fn of ["epochOf", "grantOf", "grant", "revoke"]) {
  if (!abiList.some((x) => x.type === "function" && x.name === fn)) fail(`registry ABI has no function ${fn}`);
}

// 4. Evidence the /proof page links to is copied into the export, so every link resolves.
const out = path.join(web, "public", "evidence");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const manifest = {};
const latest = (dir, re) => {
  if (!fs.existsSync(dir)) return undefined;
  const f = fs.readdirSync(dir).filter((n) => re.test(n)).sort().pop();
  return f ? path.join(dir, f) : undefined;
};
const take = (key, from, to, required) => {
  if (!from || !fs.existsSync(from)) {
    if (required) fail(`required evidence ${key} not found (${from ?? "no match"})`);
    return;
  }
  fs.copyFileSync(from, path.join(out, to));
  manifest[key] = `/evidence/${to}`;
};
take("ceremony", latest(path.join(repo, "test-rig", "results"), /^ceremony-.*\.txt$/), "ceremony.txt", true);
take("ceremonyNegative", path.join(repo, "test-rig", "results", "verify-negative-control.txt"), "ceremony-negative-control.txt", true);
take("mutationNamespacingRed", path.join(sdk, "test-results", "mutation-namespacing-red.txt"), "mutation-namespacing-red.txt", true);
take("mutationNamespacingGreen", path.join(sdk, "test-results", "mutation-namespacing-green.txt"), "mutation-namespacing-green.txt", true);
take("deployment", path.join(repo, "deployments", "testnet.json"), "deployment.json", true);
take("abi", path.join(repo, "deployments", "SatchelRegistry.abi.json"), "SatchelRegistry.abi.json", true);
take("clickThrough", latest(path.join(web, "results"), /^click-through-.*\.txt$/), "click-through.txt", false);
take("onchain", latest(path.join(web, "results"), /^onchain-\d.*\.txt$/), "onchain-readback.txt", false);
take("onchainNegative", path.join(web, "results", "negcontrol-onchain.txt"), "onchain-negative-control.txt", false);
const spikes = path.resolve(repo, "..", "..", "spikes");
take("spikeDerive", path.join(spikes, "satchel-derive", "FINDINGS.md"), "spike-derive.md", false);
take("spikeGrant", path.join(spikes, "satchel-grant", "FINDINGS.md"), "spike-grant.md", false);
const tsDir = path.join(repo, "integrations", "trustset");
if (fs.existsSync(tsDir)) {
  const dest = path.join(out, "integrations", "trustset");
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(tsDir)) {
    if (/\.(md|diff|patch)$/i.test(f)) fs.copyFileSync(path.join(tsDir, f), path.join(dest, f));
  }
  const resultsDir = path.join(tsDir, "results");
  if (fs.existsSync(resultsDir)) {
    fs.mkdirSync(path.join(dest, "results"), { recursive: true });
    for (const f of fs.readdirSync(resultsDir)) if (/\.(txt|log|md)$/i.test(f)) fs.copyFileSync(path.join(resultsDir, f), path.join(dest, "results", f));
  }
}
fs.writeFileSync(path.join(web, "lib", "evidence.generated.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`prebuild ok: ${exported.size} exports, ${wantedMethods.size} members, ${codes.length} error codes, ${Object.keys(manifest).length} evidence files, registry ${dep.address}`);
