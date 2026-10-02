import { describe, expect, test } from "bun:test";
import { hkdfSync } from "node:crypto";
import { keccak256, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createGrantee, enrol, fromPrfOutput, ns, open, parseSealed, SatchelError } from "../src/index.ts";
import { FIXES } from "../src/errors.ts";
import { codeOf, fakeAuthenticator, memoryStore, prfOf } from "./fixtures.ts";

const SALT = Buffer.from("satchel/v1");
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const hk = (ikm: Uint8Array, info: string) => new Uint8Array(hkdfSync("sha256", ikm, SALT, info, 32));
const sat = (seed = "a") => fromPrfOutput(prfOf(seed), { rpId: "localhost" });

describe("ns", () => {
  test("accepts valid paths", () => {
    expect(ns("memory/assistant")).toBe("memory/assistant");
    expect(ns("a-b/c1")).toBe("a-b/c1");
  });
  test.each(["", "ab", "Memory/x", "a//b", "/ab", "ab/", "a b", "a".repeat(65), "a_b"])("rejects %j with INVALID_NAMESPACE", async (p) => {
    expect(await codeOf(() => ns(p))).toBe("INVALID_NAMESPACE");
  });
  test("accepts exactly 64 characters", () => {
    expect(ns("a".repeat(64))).toHaveLength(64);
  });
});

describe("derivation matches the interface spec, computed independently with node:crypto", () => {
  const prf = prfOf("vector");
  test("registry owner is HKDF(prf, salt satchel/v1, info satchel/owner/secp256k1) mod n", async () => {
    const k = BigInt(toHex(hk(prf, "satchel/owner/secp256k1"))) % N;
    const expected = privateKeyToAccount(`0x${k.toString(16).padStart(64, "0")}`).address;
    expect((await fromPrfOutput(new Uint8Array(prf), { rpId: "x" })).registryOwner).toBe(expected);
  });
  test("a blob sealed by the SDK opens with a key derived by hand: dek(e) = HKDF(HKDF(prf, ns/path), dek/e)", async () => {
    const s = await fromPrfOutput(new Uint8Array(prf), { rpId: "x" });
    const n = ns("memory/assistant");
    const bytes = (await s.seal(n, "hello")).toBytes();
    const dek = hk(hk(prf, "satchel/ns/memory/assistant"), "satchel/dek/1");
    const key = await crypto.subtle.importKey("raw", dek, "AES-GCM", false, ["decrypt"]);
    const header = bytes.slice(0, 57);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: header.slice(45), additionalData: header }, key, bytes.slice(57));
    expect(new TextDecoder().decode(pt)).toBe("hello");
  });
  test("nsHash in the header is keccak256(utf8('satchel/ns/' + path))", async () => {
    const s = await sat();
    const blob = await s.seal(ns("memory/assistant"), "x");
    expect(blob.nsHash).toBe(keccak256(toBytes("satchel/ns/memory/assistant")));
  });
  test("sealed layout: SAT1, version 1, nsHash, epoch u64 BE, 12 byte iv, ciphertext plus 16 byte tag", async () => {
    const s = await sat();
    const b = (await s.seal(ns("memory/assistant"), "abc")).toBytes();
    expect([...b.slice(0, 4)]).toEqual([0x53, 0x41, 0x54, 0x31]);
    expect(b[4]).toBe(1);
    expect(toHex(b.slice(5, 37))).toBe(keccak256(toBytes("satchel/ns/memory/assistant")));
    expect(new DataView(b.buffer).getBigUint64(37, false)).toBe(1n);
    expect(b.length).toBe(57 + 3 + 16);
  });
  test("fingerprint is 8 hex chars, stable, and differs per namespace and per passkey", async () => {
    const s1 = await fromPrfOutput(new Uint8Array(prf), { rpId: "x" });
    const s2 = await fromPrfOutput(new Uint8Array(prf), { rpId: "x" });
    const other = await sat("other");
    const a = ns("memory/assistant");
    const fp = await s1.fingerprint(a);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(await s2.fingerprint(a)).toBe(fp);
    expect(await s1.fingerprint(ns("memory/notes"))).not.toBe(fp);
    expect(await other.fingerprint(a)).not.toBe(fp);
  });
});

describe("Satchel session", () => {
  test("seal accepts bytes, string and object; unseal returns bytes, unsealJson parses", async () => {
    const s = await sat();
    const n = ns("memory/assistant");
    expect(await s.unseal(n, await s.seal(n, new Uint8Array([1, 2, 3])))).toEqual(new Uint8Array([1, 2, 3]));
    expect(new TextDecoder().decode(await s.unseal(n, await s.seal(n, "héllo")))).toBe("héllo");
    expect(await s.unsealJson(n, await s.seal(n, { likes: "metric units" }))).toEqual({ likes: "metric units" });
  });
  test("unseal accepts the Sealed object or its bytes, and Sealed carries nsHash and epoch", async () => {
    const s = await sat();
    const n = ns("memory/assistant");
    const blob = await s.seal(n, "x");
    expect(blob.v).toBe(1);
    expect(blob.epoch).toBe(1);
    expect(await s.unseal(n, blob.toBytes())).toEqual(await s.unseal(n, blob));
  });
  test("close zeroes the PRF output the session owns and every later call throws SESSION_CLOSED", async () => {
    const prf = prfOf("close");
    const s = await fromPrfOutput(prf, { rpId: "x" });
    const n = ns("memory/assistant");
    const blob = await s.seal(n, "x");
    expect(prf.some((b) => b !== 0)).toBe(true);
    s.close();
    expect(prf.every((b) => b === 0)).toBe(true);
    for (const call of [() => s.seal(n, "x"), () => s.unseal(n, blob), () => s.fingerprint(n), () => s.addPasskey({ appName: "x" })]) {
      expect(await codeOf(call)).toBe("SESSION_CLOSED");
    }
  });
  test("fromPrfOutput rejects a PRF output that is not 32 bytes (PRF_UNAVAILABLE)", async () => {
    expect(await codeOf(() => fromPrfOutput(new Uint8Array(31), { rpId: "x" }))).toBe("PRF_UNAVAILABLE");
  });
  test("grant and revoke without a registry throw REGISTRY_UNREACHABLE", async () => {
    const s = await sat();
    const g = await createGrantee();
    expect(await codeOf(() => s.grant(ns("memory/assistant"), g.publicKey, { label: "x" }))).toBe("REGISTRY_UNREACHABLE");
    expect(await codeOf(() => s.revoke(ns("memory/assistant"), "1"))).toBe("REGISTRY_UNREACHABLE");
  });
});

describe("every SatchelError code is raised by a real condition", () => {
  const n = ns("memory/assistant");
  test("PRF_UNAVAILABLE: authenticator without PRF", async () => {
    const a = fakeAuthenticator({ noPrf: true });
    expect(await codeOf(() => enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client }))).toBe("PRF_UNAVAILABLE");
  });
  test("PASSKEY_CANCELLED: prompt closed", async () => {
    const a = fakeAuthenticator({ failWith: "NotAllowedError" });
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client }))).toBe("PASSKEY_CANCELLED");
  });
  test("RPID_MISMATCH: browser refuses the rpId", async () => {
    const a = fakeAuthenticator({ failWith: "SecurityError" });
    expect(await codeOf(() => open({ rpId: "preview-4f.vercel.app", webAuthnClient: a.client }))).toBe("RPID_MISMATCH");
  });
  test("WRONG_PASSKEY: a different passkey opens the blob", async () => {
    const mine = await sat("mine");
    const theirs = await sat("theirs");
    const blob = await mine.seal(n, "secret");
    expect(await codeOf(() => theirs.unseal(n, blob))).toBe("WRONG_PASSKEY");
  });
  test("NAMESPACE_MISMATCH: blob header names another namespace", async () => {
    const s = await sat();
    expect(await codeOf(async () => s.unseal(ns("memory/notes"), await s.seal(n, "x")))).toBe("NAMESPACE_MISMATCH");
  });
  test("SEAL_CORRUPT: header intact, ciphertext shorter than one GCM tag", async () => {
    const s = await sat();
    const b = (await s.seal(n, "x")).toBytes();
    expect(await codeOf(() => s.unseal(n, b.slice(0, 57 + 15)))).toBe("SEAL_CORRUPT");
    expect(await codeOf(() => parseSealed(b.slice(0, 57 + 15)))).toBe("SEAL_CORRUPT");
  });
  test("NOT_SEALED: foreign bytes, wrong version, impossible epoch", async () => {
    const s = await sat();
    const b = (await s.seal(n, "x")).toBytes();
    expect(await codeOf(() => parseSealed(new TextEncoder().encode("not a satchel blob at all, just text padding to length ........")))).toBe("NOT_SEALED");
    expect(await codeOf(() => parseSealed(new Uint8Array(4)))).toBe("NOT_SEALED");
    const v2 = b.slice();
    v2[4] = 2;
    expect(await codeOf(() => parseSealed(v2))).toBe("NOT_SEALED");
    const e0 = b.slice();
    e0.fill(0, 37, 45);
    expect(await codeOf(() => parseSealed(e0))).toBe("NOT_SEALED");
  });
  test("GRANT_NOT_FOR_KEY: a reader built from a grant issued to another key", async () => {
    const other = await createGrantee();
    const g = await createGrantee();
    const grant = fakeGrant(other.publicKey);
    expect(await codeOf(() => g.reader(grant))).toBe("GRANT_NOT_FOR_KEY");
  });
  test("INVALID_GRANTEE_KEY: grant() rejects a malformed key before touching the chain (RPC is unreachable here)", async () => {
    const s = await fromPrfOutput(prfOf("g"), { rpId: "x", registry: { address: "0x0000000000000000000000000000000000000001", rpcUrl: "http://127.0.0.1:1" } });
    for (const bad of ["0x1234", "0xzz", `0x04${"11".repeat(64)}`, `0x02${"11".repeat(64)}`] as const) {
      expect(await codeOf(() => s.grant(n, bad, { label: "x" }))).toBe("INVALID_GRANTEE_KEY");
    }
    const good = (await createGrantee()).publicKey;
    expect(await codeOf(() => s.grant(n, good, { label: "x" }))).toBe("REGISTRY_UNREACHABLE");
  });
  test("STORE_UNAVAILABLE: addPasskey with no store in a runtime without IndexedDB", async () => {
    const a = fakeAuthenticator();
    const s = await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client });
    expect(await codeOf(() => s.addPasskey({ appName: "second" }))).toBe("STORE_UNAVAILABLE");
    expect(a.creds.size).toBe(1);
  });
  test("every code has a fix string and a docs anchor", () => {
    for (const [code, fix] of Object.entries(FIXES)) {
      expect(fix.length).toBeGreaterThan(10);
      const e = new SatchelError(code as keyof typeof FIXES, "m");
      expect(e.fix).toBe(fix);
      expect(e.docs).toStartWith("/reference/errors#");
      expect(e).toBeInstanceOf(Error);
    }
    expect(Object.keys(FIXES)).toHaveLength(16);
  });
});

describe("HPKE wrap (RFC 9180, DHKEM P-256, HKDF-SHA256, AES-128-GCM)", () => {
  test("200 fresh grantee keys each unwrap their own wrap: the reader must hand HPKE the whole key pair (a bare private key failed about half the time)", async () => {
    const { wrapDek } = await import("../src/grant.ts");
    const n = ns("memory/assistant");
    const nsHash = keccak256(toBytes("satchel/ns/memory/assistant"));
    const s = await sat("hpke");
    const plain = await s.seal(n, "payload");
    let opened = 0;
    for (let i = 0; i < 200; i++) {
      const g = await createGrantee();
      const dek = new Uint8Array(await (await import("../src/derive.ts")).dekBytes(prfOf("hpke"), n, 1));
      const wrapped = await wrapDek(g.publicKey, dek, nsHash, 1);
      expect(wrapped.length).toBe(2 + 2 * 113);
      const r = g.reader({ ...fakeGrant(g.publicKey), wrappedKey: wrapped });
      expect(new TextDecoder().decode(await r.unseal(plain))).toBe("payload");
      opened++;
    }
    expect(opened).toBe(200);
  });
  test("a wrap is addressed: another grantee's key cannot open it", async () => {
    const { wrapDek } = await import("../src/grant.ts");
    const nsHash = keccak256(toBytes("satchel/ns/memory/assistant"));
    const [a, b] = [await createGrantee(), await createGrantee()];
    const wrapped = await wrapDek(a.publicKey, new Uint8Array(32), nsHash, 1);
    const s = await sat("hpke2");
    const blob = await s.seal(ns("memory/assistant"), "x");
    expect(await codeOf(() => b.reader({ ...fakeGrant(b.publicKey), wrappedKey: wrapped }).unseal(blob))).toBe("GRANT_NOT_FOR_KEY");
  });
});

function fakeGrant(pub: `0x${string}`) {
  return {
    id: "1",
    ns: ns("memory/assistant"),
    nsHash: keccak256(toBytes("satchel/ns/memory/assistant")),
    epoch: 1,
    granteeKeyHash: keccak256(pub),
    wrappedKey: "0x00" as const,
    label: "x",
    txHash: "0x00" as const,
  };
}

describe("enrol, open and addPasskey through a software authenticator", () => {
  test("enrol then open on the same authenticator derive the same keys with one prompt each", async () => {
    const a = fakeAuthenticator();
    const first = await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client });
    const n = ns("memory/assistant");
    const blob = await first.seal(n, "kept");
    expect(a.calls).toEqual({ create: 1, get: 0 });
    const again = await open({ rpId: "localhost", webAuthnClient: a.client, store: memoryStore() });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(await again.fingerprint(n)).toBe(await first.fingerprint(n));
    expect(new TextDecoder().decode(await again.unseal(n, blob))).toBe("kept");
    expect(again.credential?.credentialId).toBe(first.credential?.credentialId);
    // a second namespace costs no further prompt
    await again.unseal(ns("memory/other"), await again.seal(ns("memory/other"), "y"));
    expect(a.calls.get).toBe(1);
  });
  test("a different authenticator cannot open the first authenticator's blob (WRONG_PASSKEY)", async () => {
    const a = fakeAuthenticator();
    const b = fakeAuthenticator();
    const n = ns("memory/assistant");
    const blob = await (await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client })).seal(n, "mine");
    const stranger = await enrol({ rpId: "localhost", appName: "t", webAuthnClient: b.client });
    expect(await codeOf(() => stranger.unseal(n, blob))).toBe("WRONG_PASSKEY");
  });
  test("addPasskey wraps the root so the second passkey opens the first passkey's data; recover demands that", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const n = ns("memory/assistant");
    const first = await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client, store });
    const blob = await first.seal(n, "survives");
    await first.addPasskey({ appName: "second" });
    expect(a.creds.size).toBe(2);
    expect(store.map.size).toBe(1);
    const [firstId, secondId] = [...a.creds.keys()];
    const viaSecond = await open({ rpId: "localhost", webAuthnClient: a.client, store, recover: true, credential: { credentialId: secondId! } });
    expect(new TextDecoder().decode(await viaSecond.unseal(n, blob))).toBe("survives");
    expect(await viaSecond.fingerprint(n)).toBe(await first.fingerprint(n));
    expect(viaSecond.registryOwner).toBe(first.registryOwner);
    // the original passkey was never added, so recover refuses it
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client, store, recover: true, credential: { credentialId: firstId! } }))).toBe("NO_SECOND_PASSKEY");
    // no store at all
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client, store: undefined, recover: true, credential: { credentialId: firstId! } }))).toBe("NO_SECOND_PASSKEY");
  });
  test("a wrap that fails authentication is WRONG_PASSKEY", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const first = await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client, store });
    await first.addPasskey({ appName: "second" });
    const [key, value] = [...store.map][0]!;
    const bad = value.slice();
    bad[20]! ^= 1;
    store.map.set(key, bad);
    const secondId = [...a.creds.keys()][1]!;
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client, store, credential: { credentialId: secondId } }))).toBe("WRONG_PASSKEY");
  });
  test("store read failure is STORE_UNAVAILABLE", async () => {
    const a = fakeAuthenticator();
    await enrol({ rpId: "localhost", appName: "t", webAuthnClient: a.client });
    const broken = { get: async () => { throw new Error("idb down"); }, put: async () => {} };
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client, store: broken }))).toBe("STORE_UNAVAILABLE");
  });
});
