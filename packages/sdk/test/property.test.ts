import { describe, expect, setDefaultTimeout, test } from "bun:test";
import * as fc from "fast-check";
import { dekKey, nsHashOf, nsKeyBytes } from "../src/derive.ts";
import { fromPrfOutput, ns, SatchelError } from "../src/index.ts";
import { codeOf } from "./fixtures.ts";

const pathArb = fc
  .stringMatching(/^[a-z0-9]+([/-][a-z0-9]+)*$/)
  .filter((p) => p.length >= 3 && p.length <= 64)
  .map((p) => ns(p));
const prfArb = fc.uint8Array({ minLength: 32, maxLength: 32 });
const hex = (u: Uint8Array) => Buffer.from(u).toString("hex");
const sat = (prf: Uint8Array) => fromPrfOutput(new Uint8Array(prf), { rpId: "localhost" });
const HEADER = 57;
setDefaultTimeout(60_000);

describe("property: derivation", () => {
  test("(1) same PRF output and path always derive the same keys and fingerprint", async () => {
    await fc.assert(
      fc.asyncProperty(prfArb, pathArb, async (prf, path) => {
        const [a, b] = await Promise.all([sat(prf), sat(prf)]);
        expect(await a.fingerprint(path)).toBe(await b.fingerprint(path));
        expect(hex(await nsKeyBytes(prf, path))).toBe(hex(await nsKeyBytes(prf, path)));
        expect(a.registryOwner).toBe(b.registryOwner);
        expect(new TextDecoder().decode(await b.unseal(path, await a.seal(path, "x")))).toBe("x");
      }),
      { numRuns: 100 },
    );
  });

  test("(2) 1,000 distinct paths give 1,000 distinct namespace keys, hashes and epoch data keys", async () => {
    let checked = 0;
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(pathArb, { minLength: 1000, maxLength: 1000 }), prfArb, async (paths, prf) => {
        const keys = new Set<string>();
        const hashes = new Set<string>();
        const deks = new Set<string>();
        for (const p of paths) {
          keys.add(hex(await nsKeyBytes(prf, p)));
          hashes.add(nsHashOf(p));
          deks.add(hex(new Uint8Array(await crypto.subtle.exportKey("raw", await extractableDek(prf, p, 1)))));
        }
        expect(paths.length).toBe(1000);
        expect(keys.size).toBe(1000);
        expect(hashes.size).toBe(1000);
        expect(deks.size).toBe(1000);
        checked++;
      }),
      { numRuns: 3, endOnFailure: true },
    );
    expect(checked).toBe(3);
  });

  test("(2b) one path under two epochs, and two PRF outputs under one path, never share a data key", async () => {
    await fc.assert(
      fc.asyncProperty(prfArb, prfArb, pathArb, async (p1, p2, path) => {
        fc.pre(hex(p1) !== hex(p2));
        const raw = async (prf: Uint8Array, e: number) => hex(new Uint8Array(await crypto.subtle.exportKey("raw", await extractableDek(prf, path, e))));
        expect(await raw(p1, 1)).not.toBe(await raw(p1, 2));
        expect(await raw(p1, 1)).not.toBe(await raw(p2, 1));
      }),
      { numRuns: 100 },
    );
  });
});

describe("property: sealing", () => {
  test("(3) unseal(seal(x)) == x for arbitrary bytes, strings and JSON", async () => {
    const jsonArb = fc.oneof(fc.dictionary(fc.string(), fc.jsonValue()), fc.array(fc.jsonValue()));
    await fc.assert(
      fc.asyncProperty(prfArb, pathArb, fc.uint8Array({ maxLength: 4096 }), fc.string({ unit: "grapheme", maxLength: 300 }), jsonArb, async (prf, path, bytes, str, json) => {
        const s = await sat(prf);
        expect(await s.unseal(path, await s.seal(path, bytes))).toEqual(bytes);
        expect(new TextDecoder().decode(await s.unseal(path, (await s.seal(path, str)).toBytes()))).toBe(str);
        expect(await s.unsealJson(path, await s.seal(path, json))).toEqual(JSON.parse(JSON.stringify(json)));
      }),
      { numRuns: 200 },
    );
  });

  test("(4) a namespace key never opens another namespace's blob", async () => {
    await fc.assert(
      fc.asyncProperty(prfArb, pathArb, pathArb, fc.uint8Array({ minLength: 1, maxLength: 512 }), async (prf, a, b, data) => {
        fc.pre(a !== b);
        const s = await sat(prf);
        const blob = (await s.seal(a, data)).toBytes();
        const header = blob.slice(0, HEADER);
        // key level, AAD held identical to the sealed one so only the key can differ: namespace B's data key must fail the auth tag
        const wrongKey = await dekKey(prf, b, 1);
        await expect(
          crypto.subtle.decrypt({ name: "AES-GCM", iv: header.slice(45), additionalData: header }, wrongKey, blob.slice(HEADER)),
        ).rejects.toThrow();
        // API level: asking for B names the mismatch before decrypting
        expect(await codeOf(() => s.unseal(b, blob))).toBe("NAMESPACE_MISMATCH");
        // header rewritten to claim B: passes the namespace check, still fails authentication
        const forged = blob.slice();
        forged.set(Buffer.from(nsHashOf(b).slice(2), "hex"), 5);
        expect(await codeOf(() => s.unseal(b, forged))).toBe("WRONG_PASSKEY");
        // the true namespace still opens
        expect(await s.unseal(a, blob)).toEqual(data);
      }),
      { numRuns: 100 },
    );
  });

  test("(6) altering any single header byte, or any ciphertext byte, makes unseal throw a SatchelError", async () => {
    await fc.assert(
      fc.asyncProperty(prfArb, pathArb, fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.nat(), fc.integer({ min: 1, max: 255 }), async (prf, path, data, pos, mask) => {
        const s = await sat(prf);
        const blob = (await s.seal(path, data)).toBytes();
        const tampered = blob.slice();
        const i = pos % blob.length;
        tampered[i]! ^= mask;
        let err: unknown;
        try {
          await s.unseal(path, tampered);
        } catch (e) {
          err = e;
        }
        expect(err).toBeInstanceOf(SatchelError);
        if (i < 5) expect((err as SatchelError).code).toBe("NOT_SEALED");
        else if (i < 37) expect((err as SatchelError).code).toBe("NAMESPACE_MISMATCH");
        else if (i < 45) expect(["NOT_SEALED", "WRONG_PASSKEY"]).toContain((err as SatchelError).code);
        else expect((err as SatchelError).code).toBe("WRONG_PASSKEY");
      }),
      { numRuns: 500 },
    );
  });
});

async function extractableDek(prf: Uint8Array, path: ReturnType<typeof ns>, epoch: number) {
  const { dekBytes } = await import("../src/derive.ts");
  return crypto.subtle.importKey("raw", (await dekBytes(prf, path, epoch)) as Uint8Array<ArrayBuffer>, "AES-GCM", true, ["decrypt"]);
}
