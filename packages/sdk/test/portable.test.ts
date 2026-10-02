import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createPublicClient, formatEther, http, parseEther } from "viem";
import { foundry, monadTestnet } from "viem/chains";
import { createGrantee, epochOf, fetchGrant, fromPrfOutput, ns, nsHashOf, registryAbi, type Registry, SatchelError } from "../src/index.ts";
import { compileRegistry, deployRegistry, fund, setBalance, startAnvil } from "./anvil.ts";
import { codeOf, prfOf } from "./fixtures.ts";

setDefaultTimeout(120_000);
const text = (u: Uint8Array) => new TextDecoder().decode(u);
const memory = ns("memory/assistant");

let stop: () => void;
let rpcUrl: string;
let registry: Registry;
let bytecode: `0x${string}`;
let pub: ReturnType<typeof createPublicClient>;
/** Forwards JSON-RPC to anvil and records every method name, so a test can assert which calls a function made. */
let proxy: { url: string; methods: string[]; stop(): void };

function startProxy(target: string) {
  const methods: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.text();
      const calls = JSON.parse(body) as { method: string } | { method: string }[];
      for (const c of Array.isArray(calls) ? calls : [calls]) methods.push(c.method);
      return fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, methods, stop: () => server.stop(true) };
}

async function owner(seed: string, balanceEth = 100) {
  const s = await fromPrfOutput(prfOf(seed), { rpId: "localhost", registry });
  await setBalance(rpcUrl, s.registryOwner, parseEther(String(balanceEth)));
  return s;
}

beforeAll(async () => {
  bytecode = compileRegistry();
  const a = await startAnvil(8549);
  stop = a.stop;
  rpcUrl = a.rpcUrl;
  registry = { address: await deployRegistry(a.rpcUrl, bytecode), rpcUrl: a.rpcUrl, chain: foundry };
  pub = createPublicClient({ chain: foundry, transport: http(a.rpcUrl) });
  proxy = startProxy(a.rpcUrl);
});
afterAll(() => {
  proxy?.stop();
  stop?.();
});

describe("exports the error texts point at", () => {
  test("epochOf, nsHashOf and registryAbi read the same chain state the session does", async () => {
    const s = await owner("exports-1");
    const fern = await createGrantee();
    const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
    expect(nsHashOf(memory)).toBe(grant.nsHash);
    expect(await epochOf(registry, s.registryOwner, nsHashOf(memory))).toBe(1);
    await s.revoke(memory, grant.id);
    expect(await epochOf(registry, s.registryOwner, nsHashOf(memory))).toBe(2);
    expect(registryAbi.some((x) => x.type === "function" && x.name === "grantOf")).toBe(true);
  });
});

describe("OWNER_UNFUNDED", () => {
  test("grant and revoke on an unfunded owner throw it with the owner, the shortfall and the fix, and send nothing", async () => {
    const s = await owner("unfunded-1", 0);
    const fern = await createGrantee();
    const err = (await s.grant(memory, fern.publicKey, { label: "Fern" }).catch((e) => e)) as SatchelError;
    expect(err).toBeInstanceOf(SatchelError);
    expect(err.code).toBe("OWNER_UNFUNDED");
    expect(err.message).toContain(s.registryOwner);
    expect(err.message).toMatch(/Short by 0\.\d+ ETH/);
    expect(err.fix).toContain(s.registryOwner);
    expect(err.fix).toMatch(/send at least 0\.\d+ ETH/);
    expect(await pub.getTransactionCount({ address: s.registryOwner })).toBe(0);
    expect(await epochOf(registry, s.registryOwner, nsHashOf(memory))).toBe(1);
  });

  test("revoke on an owner that spent its balance after granting throws it too, and the grant stays active", async () => {
    const s = await owner("unfunded-3");
    const fern = await createGrantee();
    const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
    await setBalance(rpcUrl, s.registryOwner, 0n);
    const err = (await s.revoke(memory, grant.id).catch((e) => e)) as SatchelError;
    expect(err.code).toBe("OWNER_UNFUNDED");
    expect(err.fix).toContain(s.registryOwner);
    const [, , , , active] = await pub.readContract({ address: registry.address, abi: registryAbi, functionName: "grantOf", args: [BigInt(grant.id)] });
    expect(active).toBe(true);
    expect(await epochOf(registry, s.registryOwner, nsHashOf(memory))).toBe(1);
    await setBalance(rpcUrl, s.registryOwner, parseEther("1"));
    expect((await s.revoke(memory, grant.id)).epoch).toBe(2);
  });

  test("the shortfall shrinks as the owner is funded, and the same call succeeds once it holds enough", async () => {
    const s = await owner("unfunded-2", 0);
    const fern = await createGrantee();
    const short = async () => Number(/Short by ([0-9.]+)/.exec(((await s.grant(memory, fern.publicKey, { label: "x" }).catch((e) => e)) as SatchelError).message)![1]);
    const none = await short();
    await setBalance(rpcUrl, s.registryOwner, parseEther(String(none / 2)));
    const half = await short();
    expect(none).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(none);
    expect(half).toBeCloseTo(none / 2, 6);
    await setBalance(rpcUrl, s.registryOwner, parseEther("1"));
    const grant = await s.grant(memory, fern.publicKey, { label: "x" });
    expect(grant.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(Number(formatEther(await pub.getBalance({ address: s.registryOwner })))).toBeLessThan(1);
  });

  test("a revert is still REGISTRY_UNREACHABLE with its reason, and an unreachable RPC is REGISTRY_UNREACHABLE, not OWNER_UNFUNDED", async () => {
    const a = await owner("owner-a");
    const mallory = await owner("mallory-2");
    const fern = await createGrantee();
    const grant = await a.grant(memory, fern.publicKey, { label: "Fern" });
    const err = (await mallory.revoke(memory, grant.id).catch((e) => e)) as SatchelError;
    expect(err.code).toBe("REGISTRY_UNREACHABLE");
    const down = await fromPrfOutput(prfOf("down"), { rpId: "x", registry: { address: registry.address, rpcUrl: "http://127.0.0.1:1", chain: foundry } });
    expect(await codeOf(() => down.grant(memory, fern.publicKey, { label: "x" }))).toBe("REGISTRY_UNREACHABLE");
  });

  test("on Monad testnet the fix names MON and the faucet", async () => {
    const monad = { ...monadTestnet, rpcUrls: { default: { http: [rpcUrl] } } };
    const s = await fromPrfOutput(prfOf("monad-flavour"), { rpId: "x", registry: { address: registry.address, rpcUrl, chain: monad } });
    const err = (await s.grant(memory, (await createGrantee()).publicKey, { label: "x" }).catch((e) => e)) as SatchelError;
    expect(err.code).toBe("OWNER_UNFUNDED");
    expect(err.fix).toContain("https://faucet.monad.xyz");
    expect(err.fix).toContain(s.registryOwner);
    expect(err.fix).toMatch(/send at least [0-9.]+ MON/);
  });
});

describe("fetchGrant: a Grant is portable through its transaction hash", () => {
  test("a second reader instance with only the persisted key pair, the tx hash and the blob opens the data", async () => {
    const s = await owner("portable-1");
    const fern = await createGrantee();
    const blob = await s.seal(memory, { likes: "metric units" });
    const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
    // app B knows nothing but its own key pair, the hash, the registry and the sealed bytes
    const appB = await createGrantee(fern.keyPair);
    const fetched = await fetchGrant({ txHash: grant.txHash, registry, ns: memory });
    expect(fetched).toEqual(grant);
    expect(await appB.reader(fetched).unsealJson<{ likes: string }>(blob.toBytes())).toEqual({ likes: "metric units" });
  });

  test("it accepts a bare registry address plus rpcUrl and chain, and without ns the Grant carries no namespace path", async () => {
    const s = await owner("portable-2");
    const fern = await createGrantee();
    const blob = await s.seal(memory, "hello");
    const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
    const fetched = await fetchGrant({ txHash: grant.txHash, registry: registry.address, rpcUrl, chain: foundry });
    expect("ns" in fetched).toBe(false);
    expect(fetched.nsHash).toBe(nsHashOf(memory));
    expect(fetched.epoch).toBe(1);
    expect(text(await fern.reader(fetched).unseal(blob))).toBe("hello");
    const wrongNs = await fern.reader(fetched).unseal(await s.seal(ns("memory/notes"), "x")).catch((e) => e);
    expect(wrongNs.code).toBe("NAMESPACE_MISMATCH");
    expect(wrongNs.message).toContain(nsHashOf(memory));
  });

  test("it reads one receipt and never scans logs (Monad caps eth_getLogs at 100 blocks); the recorder does see a getLogs when one is made", async () => {
    const s = await owner("portable-3");
    const grant = await s.grant(memory, (await createGrantee()).publicKey, { label: "x" });
    proxy.methods.length = 0;
    await fetchGrant({ txHash: grant.txHash, registry: { address: registry.address, rpcUrl: proxy.url, chain: foundry }, ns: memory });
    expect(proxy.methods.length).toBeGreaterThan(0);
    expect(proxy.methods).toContain("eth_getTransactionReceipt");
    expect(proxy.methods).not.toContain("eth_getLogs");
    const control = createPublicClient({ chain: foundry, transport: http(proxy.url) });
    await control.getLogs({ address: registry.address, fromBlock: 0n, toBlock: 1n });
    expect(proxy.methods).toContain("eth_getLogs");
  });

  test("a grant for another key is refused by the reader, the wrong ns and a non-grant tx are refused by fetchGrant", async () => {
    const s = await owner("portable-4");
    const fern = await createGrantee();
    const bob = await createGrantee();
    const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
    const fetched = await fetchGrant({ txHash: grant.txHash, registry });
    expect(await codeOf(() => bob.reader(fetched))).toBe("GRANT_NOT_FOR_KEY");
    expect(await codeOf(() => fetchGrant({ txHash: grant.txHash, registry, ns: ns("memory/notes") }))).toBe("NAMESPACE_MISMATCH");
    const revoke = await s.revoke(memory, grant.id);
    const noEvent = (await fetchGrant({ txHash: revoke.txHash, registry }).catch((e) => e)) as SatchelError;
    expect(noEvent.code).toBe("REGISTRY_UNREACHABLE");
    expect(noEvent.message).toContain("no Granted event");
    const wrongRegistry = (await fetchGrant({ txHash: grant.txHash, registry: { address: "0x00000000000000000000000000000000000000aa", rpcUrl, chain: foundry } }).catch((e) => e)) as SatchelError;
    expect(wrongRegistry.code).toBe("REGISTRY_UNREACHABLE");
    expect(wrongRegistry.message).toContain("no Granted event");
  });

  test("an unknown tx hash is REGISTRY_UNREACHABLE", async () => {
    const err = (await fetchGrant({ txHash: `0x${"11".repeat(32)}`, registry }).catch((e) => e)) as SatchelError;
    expect(err.code).toBe("REGISTRY_UNREACHABLE");
    expect(err.message).toContain("no receipt");
  }, 30_000);
});

describe("revoking one grant moves every reader to the next epoch; regrant restores the ones that should stay", () => {
  test("a second reader loses new data after another reader's revoke, regains it after regrant, and the revoked reader does not", async () => {
    const s = await owner("regrant-1");
    const fern = await createGrantee();
    const bob = await createGrantee();
    const gFern = await s.grant(memory, fern.publicKey, { label: "Fern" });
    const gBob1 = await s.grant(memory, bob.publicKey, { label: "Bob" });
    const old = await s.seal(memory, "epoch one");

    await s.revoke(memory, gFern.id);
    const fresh = await s.seal(memory, "epoch two");
    expect([old.epoch, fresh.epoch]).toEqual([1, 2]);

    // Bob's grant was never revoked on chain, yet it only opens epoch 1: the epoch bump is namespace-wide
    const [, , , , bobActive] = await pub.readContract({ address: registry.address, abi: registryAbi, functionName: "grantOf", args: [BigInt(gBob1.id)] });
    expect(bobActive).toBe(true);
    expect(text(await bob.reader(gBob1).unseal(old))).toBe("epoch one");
    expect(await codeOf(() => bob.reader(gBob1).unseal(fresh))).toBe("GRANT_REVOKED");

    const gBob2 = await s.regrant(memory, bob.publicKey, { label: "Bob again" });
    expect(gBob2.epoch).toBe(2);
    expect(gBob2.id).not.toBe(gBob1.id);
    const viaTx = await fetchGrant({ txHash: gBob2.txHash, registry, ns: memory });
    expect(text(await bob.reader(viaTx).unseal(fresh))).toBe("epoch two");
    const newer = await s.seal(memory, "still epoch two");
    expect(text(await bob.reader(viaTx).unseal(newer))).toBe("still epoch two");

    expect(await codeOf(() => fern.reader(gFern).unseal(fresh))).toBe("GRANT_REVOKED");
    expect(await codeOf(() => fern.reader(gFern).unseal(newer))).toBe("GRANT_REVOKED");
    expect(text(await fern.reader(gFern).unseal(old))).toBe("epoch one");
    expect(await epochOf(registry, s.registryOwner, nsHashOf(memory) as `0x${string}`)).toBe(2);
  });

  test("regrant is a registry write like grant: an unfunded owner gets OWNER_UNFUNDED", async () => {
    const s = await owner("regrant-2", 0);
    const to = (await createGrantee()).publicKey;
    expect(await codeOf(() => s.regrant(memory, to, { label: "x" }))).toBe("OWNER_UNFUNDED");
  });
});

