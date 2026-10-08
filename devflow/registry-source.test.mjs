import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { LOCK_ENTRY, EXPECTED_RESOLVED, EXPECTED_VERSION, validateRegistrySource } from "./registry-source.mjs";

const REAL_INTEGRITY = "sha512-iSwC84sdVE/JlnOo0NGZjRhSHocDKpWaxg93f4Lb0bs4U3LnhNvqdKWUtXqWmKmfSNMXDQIhAEILJ325nxfCug==";

// Fixture shapes copied from real installs: the registry shape from `npm install satchel-sdk@0.1.0`, the file: shape
// from `npm install ./satchel-sdk-0.1.0.tgz`. A file: install still carries integrity, so the resolved URL is the tell.
const registryEntry = () => ({
  version: EXPECTED_VERSION,
  resolved: EXPECTED_RESOLVED,
  integrity: REAL_INTEGRITY,
  license: "MIT",
});
const lockOf = (entry) => ({ lockfileVersion: 3, packages: { [LOCK_ENTRY]: entry } });
const valid = (entry = registryEntry()) => ({ lock: lockOf(entry), manifest: { name: "satchel-sdk", version: EXPECTED_VERSION } });

test("valid registry package passes and reports version, resolved and integrity", () => {
  const r = validateRegistrySource(valid());
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.package, { version: EXPECTED_VERSION, resolved: EXPECTED_RESOLVED, integrity: REAL_INTEGRITY });
});

test("file: tarball source rejects even when the version and integrity look right", () => {
  const r = validateRegistrySource(valid({ ...registryEntry(), resolved: "file:satchel-sdk-0.1.0.tgz" }));
  assert.equal(r.ok, false);
  assert.equal(r.package, null);
  assert.match(r.problems.join("\n"), /resolved "file:satchel-sdk-0\.1\.0\.tgz" is not https:\/\/registry\.npmjs\.org/);
});

test("wrong version rejects", () => {
  const r = validateRegistrySource({
    lock: lockOf({ ...registryEntry(), version: "0.2.0" }),
    manifest: { name: "satchel-sdk", version: "0.2.0" },
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /lock version "0\.2\.0" is not 0\.1\.0/);
});

test("missing integrity rejects", () => {
  for (const integrity of [undefined, "", "   "]) {
    const entry = registryEntry();
    delete entry.integrity;
    if (integrity !== undefined) entry.integrity = integrity;
    const r = validateRegistrySource(valid(entry));
    assert.equal(r.ok, false, `integrity ${JSON.stringify(integrity)} must reject`);
    assert.match(r.problems.join("\n"), /not a nonempty sha512/);
  }
});

test("installed manifest mismatch rejects", () => {
  const r = validateRegistrySource({
    lock: lockOf(registryEntry()),
    manifest: { name: "satchel-sdk", version: "0.0.0-stage" },
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /installed manifest version "0\.0\.0-stage" does not match lock "0\.1\.0"/);
});

test("missing lock entry rejects", () => {
  for (const input of [{}, { lock: { lockfileVersion: 3, packages: {} } }, { lock: { packages: { "node_modules/viem": {} } } }]) {
    const r = validateRegistrySource({ ...input, manifest: { version: EXPECTED_VERSION } });
    assert.equal(r.ok, false);
    assert.match(r.problems.join("\n"), /package-lock has no packages\["node_modules\/satchel-sdk"\] entry/);
  }
});

const CLI = fileURLToPath(new URL("./registry-source.mjs", import.meta.url));

// The loader and the print gate the pure function cannot cover: the CLI must read a real consumer directory, exit 0
// and print the three fields only on success, and print none of them when a check fails.
const consumer = (entry, manifest) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "satchel-registry-source."));
  fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify(lockOf(entry)));
  if (manifest !== null) {
    const pkg = path.join(dir, "node_modules", "satchel-sdk");
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify(manifest));
  }
  return dir;
};

test("CLI validates a registry lock fixture and prints its version, URL and integrity", () => {
  const dir = consumer(registryEntry(), { name: "satchel-sdk", version: EXPECTED_VERSION });
  const r = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, new RegExp(`version=${EXPECTED_VERSION}`));
  assert.match(r.stdout, new RegExp(`resolved=${EXPECTED_RESOLVED.replace(/[.]/g, "\\.")}`));
  assert.match(r.stdout, new RegExp(`integrity=${REAL_INTEGRITY.replace(/[=+/]/g, "\\$&")}`));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("CLI prints none of the three fields and fails when the SDK came from a tarball", () => {
  const dir = consumer({ ...registryEntry(), resolved: "file:satchel-sdk-0.1.0.tgz" }, { name: "satchel-sdk", version: EXPECTED_VERSION });
  const r = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /FAIL registry-source: lock resolved "file:satchel-sdk-0\.1\.0\.tgz"/);
  fs.rmSync(dir, { recursive: true, force: true });
});
