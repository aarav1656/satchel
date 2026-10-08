// Proves the satchel developer flow consumed satchel-sdk from the npmjs registry, not a local tarball or a path.
// A pure validateRegistrySource({ lock, manifest }) checks the consumer's package-lock entry and the installed
// package.json; the CLI reads a consumer directory, calls it, and prints version/resolved/integrity only after
// every check passes. Node stdlib only, project-specific, no extra dependency.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = "satchel-sdk";
export const LOCK_ENTRY = `node_modules/${PKG}`;
export const EXPECTED_VERSION = "0.1.0";
export const EXPECTED_RESOLVED = "https://registry.npmjs.org/satchel-sdk/-/satchel-sdk-0.1.0.tgz";

const isSha512 = (v) => typeof v === "string" && v.trim().startsWith("sha512-") && v.trim().length > "sha512-".length;

// Pure: given the parsed package-lock and the installed satchel-sdk manifest, decide whether the SDK came from the
// expected registry tarball at the expected version with a real sha512 integrity, and whether the installed manifest
// agrees. Returns { ok, problems, package }; never touches disk and never throws on bad input.
export function validateRegistrySource({ lock, manifest } = {}) {
  const problems = [];
  const entry = lock?.packages?.[LOCK_ENTRY];
  if (!entry || typeof entry !== "object") {
    problems.push(`package-lock has no packages["${LOCK_ENTRY}"] entry`);
    return { ok: false, problems, package: null };
  }
  if (entry.version !== EXPECTED_VERSION) {
    problems.push(`lock version ${JSON.stringify(entry.version)} is not ${EXPECTED_VERSION}`);
  }
  if (entry.resolved !== EXPECTED_RESOLVED) {
    problems.push(`lock resolved ${JSON.stringify(entry.resolved)} is not ${EXPECTED_RESOLVED}`);
  }
  if (!isSha512(entry.integrity)) {
    problems.push(`lock integrity is not a nonempty sha512 (${JSON.stringify(entry.integrity)})`);
  }
  if (!manifest || typeof manifest !== "object") {
    problems.push(`installed node_modules/${PKG}/package.json is missing or unreadable`);
  } else if (manifest.version !== entry.version) {
    problems.push(`installed manifest version ${JSON.stringify(manifest.version)} does not match lock ${JSON.stringify(entry.version)}`);
  }
  if (problems.length) return { ok: false, problems, package: null };
  return {
    ok: true,
    problems: [],
    package: { version: entry.version, resolved: entry.resolved, integrity: entry.integrity },
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function runCli(argv) {
  const consumerDir = path.resolve(argv[0] || ".");
  let lock, manifest;
  try {
    lock = readJson(path.join(consumerDir, "package-lock.json"));
  } catch {
    process.stderr.write(`FAIL registry-source: cannot read package-lock.json in ${consumerDir}\n`);
    process.exit(1);
  }
  try {
    manifest = readJson(path.join(consumerDir, "node_modules", PKG, "package.json"));
  } catch {
    manifest = null;
  }
  const result = validateRegistrySource({ lock, manifest });
  if (!result.ok) {
    for (const p of result.problems) process.stderr.write(`FAIL registry-source: ${p}\n`);
    process.exit(1);
  }
  const { version, resolved, integrity } = result.package;
  process.stdout.write(`registry-source OK version=${version} resolved=${resolved} integrity=${integrity}\n`);
}

function isMain() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(self);
  } catch {
    return path.resolve(process.argv[1]) === path.resolve(self);
  }
}

if (isMain()) runCli(process.argv.slice(2));
