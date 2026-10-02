import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import * as sdk from "../src/index.ts";
import { FIXES } from "../src/errors.ts";

const src = new URL("../src/", import.meta.url).pathname;
const files = readdirSync(src).filter((f) => f.endsWith(".ts"));
const source = (f: string) => readFileSync(src + f, "utf8");

/** Member names of one exported interface, read from the source the declarations are built from. */
function members(file: string, iface: string): string[] {
  const body = source(file).match(new RegExp(`export interface ${iface}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) throw new Error(`interface ${iface} not found in src/${file}`);
  return [...body.matchAll(/^  (?:readonly )?(\w+)\s*[(<:]/gm)].map((m) => m[1]!);
}

/** Every name a developer can call: root exports plus the members of Satchel, Reader and Sealed and the createGrantee result. */
export const KNOWN = new Set<string>([
  ...Object.keys(sdk),
  ...members("session.ts", "Satchel"),
  ...members("grant.ts", "Reader"),
  ...members("sealed.ts", "Sealed"),
  "reader",
]);

/** Function-looking names, `name()`, in texts that tell a developer what to call. `${...}` interpolations are dropped first. */
export const calledNames = (text: string) => [...text.replace(/\$\{[^}]*\}/g, "").matchAll(/\b([A-Za-z_]\w*)\(\)/g)].map((m) => m[1]!);
export const unknownNames = (texts: string[], known: Set<string> = KNOWN) => [...new Set(texts.flatMap(calledNames))].filter((n) => !known.has(n)).sort();

/** The text of every `fix:` string literal written in src, which is where a thrown SatchelError gets its next-step text. */
const literalFixes = files.flatMap((f) => [...source(f).matchAll(/\bfix:\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*")/g)].map((m) => m[1]!));

describe("every function an error fix names is a real export", () => {
  test("the known set is read from the real package and is not empty", () => {
    for (const n of ["open", "openOrEnrol", "enrol", "ns", "fetchGrant", "epochOf", "nsHashOf", "registryAbi", "isSatchelError", "createGrantee", "regrant", "addPasskey", "reader", "toBytes", "seal"]) {
      expect(KNOWN.has(n)).toBe(true);
    }
    expect(KNOWN.has("rotate")).toBe(false);
  });

  test("FIXES and every `fix:` literal in src name only real functions", () => {
    expect(literalFixes.length).toBeGreaterThanOrEqual(8);
    const texts = [...Object.values(FIXES), ...literalFixes];
    const named = new Set(texts.flatMap(calledNames));
    expect(named.size).toBeGreaterThanOrEqual(8);
    expect(unknownNames(texts)).toEqual([]);
  });

  test("it can fail: a fix that names a function that is not exported is caught", () => {
    expect(unknownNames([...Object.values(FIXES), "call rotateEverything() to recover"])).toEqual(["rotateEverything"]);
    expect(unknownNames(["read epochOf() then call regrantAll()"])).toEqual(["regrantAll"]);
    expect(unknownNames(["call ${dynamic}() again"])).toEqual([]);
  });
});
