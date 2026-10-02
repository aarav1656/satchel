// Mutation check: break what the property tests guard in a temp copy, confirm they go red, run the real tree, confirm green.
// bun run test/mutation.ts   writes test-results/mutation-*.txt
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "test-results");
mkdirSync(out, { recursive: true });

function bunTest(cwd: string, args: string[]) {
  const xml = join(cwd, "junit.xml");
  rmSync(xml, { force: true });
  const r = Bun.spawnSync(["bun", "test", ...args, "--reporter=junit", `--reporter-outfile=${xml}`], { cwd, stdout: "pipe", stderr: "pipe" });
  const cases = [...readFileSync(xml, "utf8").matchAll(/<testcase name="([^"]*)"[^>]*?(\/>|>([\s\S]*?)<\/testcase>)/g)].map((m) => ({
    name: m[1]!.replaceAll("&gt;", ">").replaceAll("&apos;", "'").replaceAll("&amp;", "&"),
    failed: (m[3] ?? "").includes("<failure"),
    detail: (m[3] ?? "").match(/<failure[^>]*message="([^"]{0,160})/)?.[1] ?? "",
  }));
  return { code: r.exitCode, text: r.stdout.toString() + r.stderr.toString(), cases };
}
type Run = ReturnType<typeof bunTest>;
const failed = (r: Run) => r.cases.filter((c) => c.failed);
const passed = (r: Run) => r.cases.filter((c) => !c.failed);

function mutant(name: string, file: string, from: string, to: string, args: string[], mustFail: RegExp[]) {
  const dir = `/tmp/satchel-sdk-mutant-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const p of ["src", "test", "package.json", "tsconfig.json"]) cpSync(join(root, p), join(dir, p), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const src = readFileSync(join(dir, file), "utf8");
  if (!src.includes(from)) throw new Error(`mutation target not found in ${file}: ${from}`);
  writeFileSync(join(dir, file), src.replace(from, to));

  const red = bunTest(dir, args);
  writeFileSync(join(out, `mutation-${name}-red.txt`), `mutation: ${file}: ${from}  =>  ${to}\nargs: ${args.join(" ")}\nexit=${red.code}\n\n${red.text}`);
  const green = bunTest(root, args);
  writeFileSync(join(out, `mutation-${name}-green.txt`), `real tree, same args: ${args.join(" ")}\nexit=${green.code}\n\n${green.text}`);

  const redFails = failed(red);
  const summary = [`mutation ${name}: ${from} => ${to}`];
  let ok = red.code !== 0 && green.code === 0;
  for (const re of mustFail) {
    const hit = redFails.find((f) => re.test(f.name));
    summary.push(`  ${hit ? "RED  " : "NOT RED"} ${re}  ${hit ? `${hit.name}  [${hit.detail}]` : "(property still passed under the mutation)"}`);
    if (!hit) ok = false;
    const stayedGreen = passed(green).find((f) => re.test(f.name));
    summary.push(`  ${stayedGreen ? "GREEN" : "NOT GREEN"} restored  ${stayedGreen?.name ?? ""}`);
    if (!stayedGreen) ok = false;
  }
  summary.push(`  mutant exit=${red.code} (${redFails.length} failing), restored exit=${green.code} (${failed(green).length} failing)`);
  console.log(summary.join("\n"));
  return ok;
}

const results = [
  // same HKDF info string for every namespace
  mutant("namespacing", "src/derive.ts", "hkdfBits(root, NS_INFO + n)", "hkdfBits(root, NS_INFO)", ["test/property.test.ts"], [/\(2\)/, /\(4\)/]),
  // the epoch is never taken from the registry
  mutant("epoch", "src/session.ts", "this.o.registry ? await epochOf(this.o.registry, this.registryOwner, nsHashOf(n)) : 1", "1", ["test/registry.test.ts", "-t", "property \\(5\\)"], [/holds for random payloads/]),
  // the reader hands HPKE only the private key (the bug the 200-key test found)
  mutant("hpke-key", "src/grant.ts", "recipientKey: pair,", "recipientKey: pair.privateKey,", ["test/unit.test.ts"], [/200 fresh grantee keys/]),
  // a stale marker is left in the store after PASSKEY_NOT_FOUND
  mutant("stale-marker", "src/session.ts", "if (store) await writeMarker(store, o.rpId, undefined);", "", ["test/open-or-enrol.test.ts"], [/deletes the marker/, /store without delete/]),
  // a first visit that finds nothing chains into a second ceremony, the get-then-create the browser gesture rule can refuse
  mutant("chained-ceremonies", "src/session.ts", "throw notFound(o.rpId, e, false);", "s = await enrol(o);", ["test/open-or-enrol.test.ts"], [/nothing to open/, /at most one ceremony/]),
];
console.log(results.every(Boolean) ? "MUTATION CHECK: every mutant went red and every restore went green" : "MUTATION CHECK FAILED");
process.exit(results.every(Boolean) ? 0 : 1);
