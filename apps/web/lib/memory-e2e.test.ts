import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createGrantee, fetchGrant, fromPrfOutput, ns, parseSealed, type Registry } from "satchel-sdk";
import { parseEther, toBytes, toHex } from "viem";
import { foundry } from "viem/chains";
import { compileRegistry, deployRegistry, setBalance, startAnvil } from "../../../packages/sdk/test/anvil.ts";
import { prfOf } from "../../../packages/sdk/test/fixtures.ts";
import { MEMORY_NS } from "./config";
import { fetchNotes, publishNotes } from "./note-bus";
import { readMemories } from "./fern";

setDefaultTimeout(120_000);

const trading = () => ns(MEMORY_NS);
let stopAnvil: () => void;
let registry: Registry;
let busUrl: string;
let stopBus: () => void;
let notes: unknown[] = [];

beforeAll(async () => {
  const bytecode = compileRegistry();
  const a = await startAnvil();
  stopAnvil = a.stop;
  registry = { address: await deployRegistry(a.rpcUrl, bytecode), rpcUrl: a.rpcUrl, chain: foundry };
  notes = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, PUT, OPTIONS", "access-control-allow-headers": "content-type" };
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (url.pathname !== "/v1/notes") return new Response("not found", { status: 404, headers: cors });
      if (req.method === "GET") return Response.json(notes, { headers: cors });
      if (req.method === "PUT") {
        notes = (await req.json()) as unknown[];
        return new Response("ok", { headers: cors });
      }
      return new Response("method", { status: 405, headers: cors });
    },
  });
  busUrl = `http://127.0.0.1:${server.port}`;
  stopBus = () => server.stop(true);
});

afterAll(() => {
  stopBus?.();
  stopAnvil?.();
});

async function owner(seed: string) {
  const s = await fromPrfOutput(prfOf(seed), { rpId: "localhost", registry });
  await setBalance(registry.rpcUrl!, s.registryOwner, parseEther("100"));
  return s;
}

describe("cross-origin memory (ciphertext bus + grant reader)", () => {
  test("App B unseals App A trading note from the bus after one grant", async () => {
    const pip = await owner("pip-1");
    const fern = await createGrantee();
    const note = "Long BTC perp above 94.2k only if funding stays negative";
    const sealed = await pip.seal(trading(), { text: note, at: 1 });
    const row = { id: "n1", at: 1, hex: toHex(sealed.toBytes()) as `0x${string}` };
    await publishNotes([row], busUrl);
    expect((await fetchNotes(busUrl))[0]?.hex).toBe(row.hex);

    const grant = await pip.grant(trading(), fern.publicKey, { label: "Fern" });
    const fetched = await fetchGrant({ txHash: grant.txHash, registry, ns: trading() });
    const rows = await readMemories(fern, [fetched], await fetchNotes(busUrl));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe("open");
    if (rows[0]?.state !== "open") throw new Error("expected open");
    expect(rows[0].text).toBe(note);
  });

  test("after revoke, App B gets no plaintext for epoch-2 note", async () => {
    const pip = await owner("pip-revoke");
    const fern = await createGrantee();
    const n = trading();
    const grant = await pip.grant(n, fern.publicKey, { label: "Fern" });
    const fetched = await fetchGrant({ txHash: grant.txHash, registry, ns: n });
    const before = await pip.seal(n, { text: "visible before revoke", at: 1 });
    await pip.revoke(n, grant.id);
    const after = await pip.seal(n, { text: "MUST NOT LEAK TO FERN", at: 2 });
    const bus = [
      { id: "e1", at: 1, hex: toHex(before.toBytes()) as `0x${string}` },
      { id: "e2", at: 2, hex: toHex(after.toBytes()) as `0x${string}` },
    ];
    await publishNotes(bus, busUrl);

    const rows = await readMemories(fern, [fetched], await fetchNotes(busUrl));
    const old = rows.find((r) => r.epoch === 1);
    const neu = rows.find((r) => r.epoch === 2);
    expect(old?.state).toBe("open");
    if (old?.state === "open") expect(old.text).toBe("visible before revoke");
    expect(neu?.state).toBe("locked");
    if (neu?.state === "locked") {
      expect(neu.code).toBe("GRANT_REVOKED");
      expect(neu.text).toBeUndefined();
    }
    expect(rows.every((r) => r.state !== "open" || !r.text.includes("MUST NOT LEAK"))).toBe(true);
  });

  test("second client same PRF decrypts owner note from bus without grant or Pip localStorage", async () => {
    const prf = prfOf("second-client");
    const pip = await fromPrfOutput(prf, { rpId: "localhost", registry });
    const note = "Half size above 94.2k; exit 93.8k 4h close";
    const sealed = await pip.seal(trading(), { text: note, at: 1 });
    await publishNotes([{ id: "x", at: 1, hex: toHex(sealed.toBytes()) as `0x${string}` }], busUrl);

    const second = await fromPrfOutput(prf, { rpId: "localhost", registry });
    const hex = (await fetchNotes(busUrl))[0]!.hex;
    const back = await second.unsealJson<{ text: string }>(trading(), toBytes(hex));
    expect(back.text).toBe(note);
    expect(parseSealed(toBytes(hex)).epoch).toBe(1);
  });
});
