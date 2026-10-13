import { describe, expect, test } from "bun:test";
import { fromPrfOutput, ns } from "satchel-sdk";
import { toBytes } from "viem";
import { MEMORY_NS } from "./config";
import type { StoredMemory } from "./demo-store";
import { resealAll, sealFact, type MemoryStore } from "./memory";

const FACT = "Vegetarian, and flies out of BLR (Bengaluru)";

/** Everything a store is ever handed, as the strings that would be written to disk or posted to a bus. */
function recordingStore(): MemoryStore & { written: string[] } {
  let rows: StoredMemory[] = [];
  const written: string[] = [];
  return {
    written,
    list: () => rows,
    add: (m) => {
      written.push(JSON.stringify(m));
      rows = [...rows, m];
    },
    replace: (all) => {
      written.push(JSON.stringify(all));
      rows = all;
    },
  };
}

const leaks = (written: string[], plain: string) => {
  const bytes = new TextEncoder().encode(plain);
  return written.some((w) => w.includes(plain) || w.includes(Buffer.from(bytes).toString("hex")) || w.includes(Buffer.from(bytes).toString("base64")));
};

const vault = () => fromPrfOutput(crypto.getRandomValues(new Uint8Array(32)), { rpId: "localhost" });

describe("memories reach storage sealed", () => {
  test("a stored fact carries ciphertext only and opens with the owner key", async () => {
    const s = await vault();
    const store = recordingStore();
    const { stored, epoch } = await sealFact(s, FACT, store, 1);
    expect(store.written).toHaveLength(1);
    expect(leaks(store.written, FACT)).toBe(false);
    expect(stored.hex.startsWith("0x")).toBe(true);
    expect(epoch).toBe(1);
    expect((await s.unsealJson<{ text: string }>(ns(MEMORY_NS), toBytes(stored.hex))).text).toBe(FACT);
  });

  test("the leak check can fail: a store handed plaintext is caught", () => {
    const leaky = recordingStore();
    leaky.add({ id: "x", at: 1, hex: JSON.stringify({ text: FACT }) as `0x${string}` });
    expect(leaks(leaky.written, FACT)).toBe(true);
  });

  test("mutation: a sealer that skipped encryption is caught by the same check", async () => {
    const store = recordingStore();
    const skipSeal = { seal: async (_n: unknown, data: unknown) => ({ epoch: 1, toBytes: () => new TextEncoder().encode(JSON.stringify(data)) }) } as unknown as Parameters<typeof sealFact>[0];
    await sealFact(skipSeal, FACT, store, 2);
    expect(leaks(store.written, FACT)).toBe(true);
  });

  test("resealAll keeps every fact readable by the owner and writes ciphertext only", async () => {
    const s = await vault();
    const store = recordingStore();
    await sealFact(s, "Vegetarian", store, 1);
    await sealFact(s, "Flies out of BLR (Bengaluru)", store, 2);
    const out = await resealAll(s, store, 1);
    expect(out.count).toBe(2);
    expect(leaks(store.written, "Vegetarian")).toBe(false);
    expect(leaks(store.written, "Flies out of BLR")).toBe(false);
    const texts = await Promise.all(store.list().map((m) => s.unsealJson<{ text: string }>(ns(MEMORY_NS), toBytes(m.hex))));
    expect(texts.map((t) => t.text)).toEqual(["Vegetarian", "Flies out of BLR (Bengaluru)"]);
  });

  test("resealAll refuses to swap the store when the new epoch is behind the revoke", async () => {
    const s = await vault();
    const store = recordingStore();
    await sealFact(s, "Vegetarian", store, 1);
    const before = store.list();
    await expect(resealAll(s, store, 2)).rejects.toThrow(/behind the revoke/);
    expect(store.list()).toEqual(before);
  });
});
