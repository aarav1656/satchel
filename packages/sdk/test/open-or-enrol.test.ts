import { describe, expect, test } from "bun:test";
import { enrol, ns, open, openOrEnrol } from "../src/index.ts";
import { codeOf, fakeAuthenticator, memoryStore } from "./fixtures.ts";

const memory = ns("memory/assistant");
const base = { rpId: "localhost", appName: "t" };

describe("openOrEnrol", () => {
  test("first visit enrols after the open ceremony finds no passkey, writes the marker, later visits open with exactly one prompt", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const first = await openOrEnrol({ ...base, webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(store.map.has("satchel/known/localhost")).toBe(true);
    const blob = await first.seal(memory, "kept");
    first.close();

    const again = await openOrEnrol({ ...base, webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 2 });
    expect(a.creds.size).toBe(1);
    expect(new TextDecoder().decode(await again.unseal(memory, blob))).toBe("kept");
  });

  test("the marker holds only the public credential id", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const s = await openOrEnrol({ ...base, webAuthnClient: a.client, store });
    const marker = JSON.parse(new TextDecoder().decode(store.map.get("satchel/known/localhost")!)) as Record<string, unknown>;
    expect(Object.keys(marker).every((k) => k === "credentialId" || k === "transports")).toBe(true);
    expect(marker.credentialId).toBe(s.credential?.credentialId);
  });

  test("a passkey that exists but has no marker here (synced from another device) is opened, never duplicated", async () => {
    const a = fakeAuthenticator();
    const original = await enrol({ ...base, webAuthnClient: a.client });
    const blob = await original.seal(memory, "from the other device");
    const store = memoryStore();
    const s = await openOrEnrol({ ...base, webAuthnClient: a.client, store });
    expect(a.calls.create).toBe(1);
    expect(a.creds.size).toBe(1);
    expect(new TextDecoder().decode(await s.unseal(memory, blob))).toBe("from the other device");
    expect(store.map.has("satchel/known/localhost")).toBe(true);
  });

  test("with a marker, a closed prompt is PASSKEY_CANCELLED and does not create a second passkey", async () => {
    const opts: { failWith?: string } = {};
    const a = fakeAuthenticator(opts);
    const store = memoryStore();
    await openOrEnrol({ ...base, webAuthnClient: a.client, store });
    opts.failWith = "NotAllowedError";
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }))).toBe("PASSKEY_CANCELLED");
    expect(a.calls.create).toBe(1);
    expect(a.creds.size).toBe(1);
  });

  test("without a marker, a closed first prompt falls through to enrol and a closed enrol prompt is PASSKEY_CANCELLED", async () => {
    const opts: { failWith?: string } = { failWith: "NotAllowedError" };
    const a = fakeAuthenticator(opts);
    const store = memoryStore();
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }))).toBe("PASSKEY_CANCELLED");
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(store.map.size).toBe(0);
  });

  test("errors other than a closed prompt are thrown as they are and never enrol", async () => {
    const a = fakeAuthenticator();
    await enrol({ ...base, webAuthnClient: a.client });
    const noPrf = fakeAuthenticator({ noPrf: true });
    const created = a.calls.create;
    const err = await codeOf(() => openOrEnrol({ ...base, webAuthnClient: { ...a.client, getCredential: async () => { throw Object.assign(new Error("x"), { name: "SecurityError" }); } }, store: memoryStore() }));
    expect(err).toBe("RPID_MISMATCH");
    expect(a.calls.create).toBe(created);
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: noPrf.client, store: memoryStore() }))).toBe("PRF_UNAVAILABLE");
  });

  test("an explicit credential skips the marker and enrol", async () => {
    const a = fakeAuthenticator();
    const first = await enrol({ ...base, webAuthnClient: a.client });
    const store = memoryStore();
    const s = await openOrEnrol({ ...base, webAuthnClient: a.client, store, credential: first.credential! });
    expect(s.registryOwner).toBe(first.registryOwner);
    expect(store.map.size).toBe(0);
    expect(a.calls).toEqual({ create: 1, get: 1 });
  });

  test("a store that cannot be read is STORE_UNAVAILABLE and one that cannot be written closes the session", async () => {
    const a = fakeAuthenticator();
    const unreadable = { get: async () => { throw new Error("idb down"); }, put: async () => {} };
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store: unreadable }))).toBe("STORE_UNAVAILABLE");
    expect(a.calls).toEqual({ create: 0, get: 0 });
    const unwritable = { get: async () => undefined, put: async () => { throw new Error("quota"); } };
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store: unwritable }))).toBe("STORE_UNAVAILABLE");
  });

  test("in a runtime with no IndexedDB and no store the ceremony decides every time and nothing is written", async () => {
    const a = fakeAuthenticator();
    const first = await openOrEnrol({ ...base, webAuthnClient: a.client });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    const again = await openOrEnrol({ ...base, webAuthnClient: a.client });
    expect(a.calls).toEqual({ create: 1, get: 2 });
    expect(await again.fingerprint(memory)).toBe(await first.fingerprint(memory));
  });

  test("open() on its own is unchanged: it never enrols", async () => {
    const a = fakeAuthenticator();
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client }))).toBe("PASSKEY_CANCELLED");
    expect(a.calls.create).toBe(0);
  });
});
