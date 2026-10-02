import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import * as fc from "fast-check";
import { createPublicClient, http, type Address } from "viem";
import { foundry } from "viem/chains";
import { registryAbi } from "../src/registry.ts";
import { createGrantee, fromPrfOutput, ns, type Registry, SatchelError } from "../src/index.ts";
import { compileRegistry, deployRegistry, fund, startAnvil } from "./anvil.ts";
import { codeOf, prfOf } from "./fixtures.ts";

setDefaultTimeout(120_000);
let stop: () => void;
let registry: Registry;
let pub: ReturnType<typeof createPublicClient>;
let bytecode: `0x${string}`;
let rpcUrl: string;
const text = (u: Uint8Array) => new TextDecoder().decode(u);

async function owner(seed: string) {
  const s = await fromPrfOutput(prfOf(seed), { rpId: "localhost", registry });
  await fund(rpcUrl, s.registryOwner);
  return s;
}

beforeAll(async () => {
  bytecode = compileRegistry();
  const a = await startAnvil(8546);
  stop = a.stop;
  rpcUrl = a.rpcUrl;
  registry = { address: await deployRegistry(a.rpcUrl, bytecode), rpcUrl: a.rpcUrl, chain: foundry };
  pub = createPublicClient({ chain: foundry, transport: http(a.rpcUrl) });
});
afterAll(() => stop?.());

const grantOf = (id: string) => pub.readContract({ address: registry.address, abi: registryAbi, functionName: "grantOf", args: [BigInt(id)] });
const epochOnChain = (o: Address, hash: `0x${string}`) => pub.readContract({ address: registry.address, abi: registryAbi, functionName: "epochOf", args: [o, hash] });

describe("grant and revoke against the real SatchelRegistry on anvil", () => {
  test("grant: tx confirmed, event matches the chain state, reader opens the epoch 1 blob", async () => {
    const s = await owner("grant-1");
    const n = ns("memory/assistant");
    const g = await createGrantee();
    const blob = await s.seal(n, { likes: "metric units" });
    expect(blob.epoch).toBe(1);
    const grant = await s.grant(n, g.publicKey, { label: "Fern" });
    expect(grant).toMatchObject({ epoch: 1, ns: n, label: "Fern" });
    expect(grant.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(grant.wrappedKey.length).toBe(2 + 2 * 113);
    const [o, nsHash, epoch, keyHash, active] = await grantOf(grant.id);
    expect([o, nsHash, Number(epoch), keyHash, active]).toEqual([s.registryOwner, grant.nsHash, 1, grant.granteeKeyHash, true]);
    expect(await g.reader(grant).unsealJson<{ likes: string }>(blob)).toEqual({ likes: "metric units" });
  });

  test("revoke: epoch bumps to 2, grant inactive, new blobs are epoch 2, reader keeps epoch 1 and loses epoch 2", async () => {
    const s = await owner("revoke-1");
    const n = ns("memory/assistant");
    const fern = await createGrantee();
    const grant = await s.grant(n, fern.publicKey, { label: "Fern" });
    const before = await s.seal(n, "before revoke");
    const out = await s.revoke(n, grant.id);
    expect(out.epoch).toBe(2);
    expect(out.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Number(await epochOnChain(s.registryOwner, grant.nsHash))).toBe(2);
    expect((await grantOf(grant.id))[4]).toBe(false);
    const after = await s.seal(n, "after revoke");
    expect(after.epoch).toBe(2);
    const reader = fern.reader(grant);
    expect(text(await reader.unseal(before))).toBe("before revoke");
    const err = (await reader.unseal(after).catch((e) => e)) as SatchelError;
    expect(err).toBeInstanceOf(SatchelError);
    expect(err.code).toBe("GRANT_REVOKED");
    expect(err.message).toContain("epoch 1");
    expect(text(await s.unseal(n, after))).toBe("after revoke");
  });

  test("a remaining reader is re-granted at epoch 2 and opens epoch 2 data, the revoked one does not", async () => {
    const s = await owner("regrant");
    const n = ns("memory/assistant");
    const fern = await createGrantee();
    const bob = await createGrantee();
    const gFern = await s.grant(n, fern.publicKey, { label: "Fern" });
    const gBob1 = await s.grant(n, bob.publicKey, { label: "Bob" });
    await s.revoke(n, gFern.id);
    const gBob2 = await s.grant(n, bob.publicKey, { label: "Bob again" });
    expect(gBob2.epoch).toBe(2);
    const e2 = await s.seal(n, "epoch two");
    expect(text(await bob.reader(gBob2).unseal(e2))).toBe("epoch two");
    expect(await codeOf(() => fern.reader(gFern).unseal(e2))).toBe("GRANT_REVOKED");
    expect(await codeOf(() => bob.reader(gBob1).unseal(e2))).toBe("GRANT_REVOKED");
    // a grant for epoch 2 cannot derive the epoch 1 data key
    const e1 = await s.unseal(n, await s.seal(n, "x"));
    expect(e1.length).toBe(1);
    const old = (await s.seal(n, "old")).toBytes();
    old.set(new Uint8Array(8), 37);
    old[44] = 1;
    expect(await codeOf(() => bob.reader(gBob2).unseal(old))).toBe("GRANT_EPOCH_OLDER");
  });

  test("a reader holding another app's grant, or the wrong namespace's blob, is refused", async () => {
    const s = await owner("wrong-reader");
    const fern = await createGrantee();
    const bob = await createGrantee();
    const grant = await s.grant(ns("memory/assistant"), fern.publicKey, { label: "Fern" });
    expect(await codeOf(() => bob.reader(grant))).toBe("GRANT_NOT_FOR_KEY");
    const other = await s.seal(ns("memory/notes"), "x");
    expect(await codeOf(() => fern.reader(grant).unseal(other))).toBe("NAMESPACE_MISMATCH");
    // a wrapped key tampered after the fact: HPKE auth fails, reported as the grant not opening for this key
    const flipped = { ...grant, wrappedKey: grant.wrappedKey.slice(0, -2) + (grant.wrappedKey.endsWith("00") ? "01" : "00") } as typeof grant;
    expect(await codeOf(async () => fern.reader(flipped).unseal(await s.seal(ns("memory/assistant"), "y")))).toBe("GRANT_NOT_FOR_KEY");
    // epoch 1 data sealed, ciphertext truncated
    const good = (await s.seal(ns("memory/assistant"), "z")).toBytes();
    const bad = good.slice();
    bad[bad.length - 1]! ^= 1;
    expect(await codeOf(() => fern.reader(grant).unseal(bad))).toBe("SEAL_CORRUPT");
  });

  test("revoke by a foreign owner, of an inactive grant, or with a bad id reverts into REGISTRY_UNREACHABLE and changes nothing", async () => {
    const s = await owner("owner-a");
    const mallory = await owner("mallory");
    const n = ns("memory/assistant");
    const fern = await createGrantee();
    const grant = await s.grant(n, fern.publicKey, { label: "Fern" });
    expect(await codeOf(() => mallory.revoke(n, grant.id))).toBe("REGISTRY_UNREACHABLE");
    expect(Number(await epochOnChain(s.registryOwner, grant.nsHash))).toBe(1);
    expect((await grantOf(grant.id))[4]).toBe(true);
    await s.revoke(n, grant.id);
    expect(await codeOf(() => s.revoke(n, grant.id))).toBe("REGISTRY_UNREACHABLE");
    expect(Number(await epochOnChain(s.registryOwner, grant.nsHash))).toBe(2);
    expect(await codeOf(() => s.revoke(n, "not-a-number"))).toBe("REGISTRY_UNREACHABLE");
  });

  test("two owners using the same path have independent epochs", async () => {
    const a = await owner("iso-a");
    const b = await owner("iso-b");
    const n = ns("memory/assistant");
    const gb = await createGrantee();
    const grant = await a.grant(n, gb.publicKey, { label: "x" });
    await a.revoke(n, grant.id);
    expect((await a.seal(n, "x")).epoch).toBe(2);
    expect((await b.seal(n, "x")).epoch).toBe(1);
  });
});

describe("property (5): a grant reader opens epoch e and throws on epoch e+1 after revoke-rotation", () => {
  test("holds for random payloads, namespaces and starting epochs, checked against the chain", async () => {
    let runs = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2 }),
        fc.stringMatching(/^[a-z0-9]{3,12}$/),
        fc.uint8Array({ minLength: 1, maxLength: 300 }),
        fc.uint8Array({ minLength: 1, maxLength: 300 }),
        async (priorRotations, label, dataE, dataE1) => {
          const s = await owner(`prop5-${runs}-${label}`);
          const n = ns(`prop/${label}`);
          // advance the namespace to epoch e = 1 + priorRotations by granting and revoking throwaway readers
          for (let i = 0; i < priorRotations; i++) await s.revoke(n, (await s.grant(n, (await createGrantee()).publicKey, { label: "tmp" })).id);
          const e = 1 + priorRotations;
          const reader = await createGrantee();
          const grant = await s.grant(n, reader.publicKey, { label });
          expect(grant.epoch).toBe(e);
          const blobE = await s.seal(n, dataE);
          expect(blobE.epoch).toBe(e);
          expect(await reader.reader(grant).unseal(blobE)).toEqual(dataE);
          const out = await s.revoke(n, grant.id);
          expect(out.epoch).toBe(e + 1);
          const blobE1 = await s.seal(n, dataE1);
          expect(blobE1.epoch).toBe(e + 1);
          expect(await codeOf(() => reader.reader(grant).unseal(blobE1))).toBe("GRANT_REVOKED");
          expect(await reader.reader(grant).unseal(blobE)).toEqual(dataE);
          expect(await s.unseal(n, blobE1)).toEqual(dataE1);
          runs++;
        },
      ),
      { numRuns: 12 },
    );
    expect(runs).toBe(12);
  }, 120_000);
});

describe("confirmation failures", () => {
  test("a tx that is accepted and then reverts in its block throws, with the revert named", async () => {
    const a = await startAnvil(8547, ["--block-time", "2"]);
    try {
      const reg: Registry = { address: await deployRegistry(a.rpcUrl, bytecode), rpcUrl: a.rpcUrl, chain: foundry };
      const s = await fromPrfOutput(prfOf("slow-block"), { rpId: "x", registry: reg });
      await fund(a.rpcUrl, s.registryOwner);
      const n = ns("memory/assistant");
      const fern = await createGrantee();
      const grant = await s.grant(n, fern.publicKey, { label: "Fern" });
      // two revokes of one grant in the same block: both pass gas estimation, the second reverts when mined
      const [first, second] = await Promise.allSettled([s.revoke(n, grant.id), new Promise((r) => setTimeout(r, 600)).then(() => s.revoke(n, grant.id))]);
      expect(first.status).toBe("fulfilled");
      expect(second.status).toBe("rejected");
      const err = (second as PromiseRejectedResult).reason as SatchelError;
      expect(err.code).toBe("REGISTRY_UNREACHABLE");
      expect(err.message).toMatch(/reverted|not accepted/);
    } finally {
      a.stop();
    }
  }, 60_000);

  test("a tx that is never mined is reported unconfirmed after the 30 second window", async () => {
    const a = await startAnvil(8548);
    try {
      const reg: Registry = { address: await deployRegistry(a.rpcUrl, bytecode), rpcUrl: a.rpcUrl, chain: foundry };
      const s = await fromPrfOutput(prfOf("never-mined"), { rpId: "x", registry: reg });
      await fund(a.rpcUrl, s.registryOwner);
      await fetch(a.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "evm_setAutomine", params: [false] }) });
      const t0 = Date.now();
      const err = (await s.grant(ns("memory/assistant"), (await createGrantee()).publicKey, { label: "x" }).catch((e) => e)) as SatchelError;
      expect(err.code).toBe("REGISTRY_UNREACHABLE");
      expect(err.message).toContain("did not confirm");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(29_000);
    } finally {
      a.stop();
    }
  }, 60_000);
});
