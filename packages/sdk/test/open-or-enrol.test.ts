import { describe, expect, test } from "bun:test";
import { enrol, isSatchelError, ns, open, openOrEnrol, rememberedPasskey, type Store } from "../src/index.ts";
import { codeOf, fakeAuthenticator, memoryStore } from "./fixtures.ts";

const memory = ns("memory/assistant");
const base = { rpId: "localhost", appName: "t" };
const KEY = "satchel/known/localhost";
const total = (c: { create: number; get: number }) => c.create + c.get;

describe("openOrEnrol: one WebAuthn ceremony per call", () => {
  test("no marker and mode enrol: exactly one create, no get, the marker is written, later calls open with exactly one get", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const first = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 0 });
    expect(store.map.has(KEY)).toBe(true);
    const blob = await first.seal(memory, "kept");
    first.close();

    const again = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(a.creds.size).toBe(1);
    expect(new TextDecoder().decode(await again.unseal(memory, blob))).toBe("kept");
  });

  test("no marker and no mode: CHOOSE_PASSKEY_MODE before any ceremony, nothing written; a mode that is not open or enrol is the same", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }))).toBe("CHOOSE_PASSKEY_MODE");
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "both" as never, webAuthnClient: a.client, store }))).toBe("CHOOSE_PASSKEY_MODE");
    expect(total(a.calls)).toBe(0);
    expect(store.map.size).toBe(0);
  });

  test("every path with no marker makes at most one ceremony call, whatever the authenticator answers", async () => {
    for (const mode of ["open", "enrol"] as const) {
      for (const failWith of [undefined, "NotAllowedError", "SecurityError"]) {
        const a = fakeAuthenticator(failWith ? { failWith } : {});
        await codeOf(() => openOrEnrol({ ...base, mode, webAuthnClient: a.client, store: memoryStore() }));
        expect(total(a.calls)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("no marker and mode open: a passkey that exists (synced from another device) opens with one get, is never duplicated, and the marker is written", async () => {
    const a = fakeAuthenticator();
    const original = await enrol({ ...base, webAuthnClient: a.client });
    const blob = await original.seal(memory, "from the other device");
    const store = memoryStore();
    const s = await openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(a.creds.size).toBe(1);
    expect(new TextDecoder().decode(await s.unseal(memory, blob))).toBe("from the other device");
    expect(store.map.has(KEY)).toBe(true);
  });

  test("no marker, mode open, and nothing to open: PASSKEY_NOT_FOUND after one get, no create, no marker", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store }))).toBe("PASSKEY_NOT_FOUND");
    expect(a.calls).toEqual({ create: 0, get: 1 });
    expect(store.map.size).toBe(0);
  });

  test("mode enrol with a closed create prompt is PASSKEY_CANCELLED and writes no marker", async () => {
    const a = fakeAuthenticator({ failWith: "NotAllowedError" });
    const store = memoryStore();
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store }))).toBe("PASSKEY_CANCELLED");
    expect(a.calls).toEqual({ create: 1, get: 0 });
    expect(store.map.size).toBe(0);
  });
});

describe("openOrEnrol: a stale marker never traps anyone", () => {
  /** A marker written by a run whose passkey no longer exists: the credential id is not on this authenticator. */
  const stale = (a: ReturnType<typeof fakeAuthenticator>) => {
    const store = memoryStore();
    store.map.set(KEY, new TextEncoder().encode(JSON.stringify({ credentialId: Buffer.from("gone-passkey-id!").toString("base64url") })));
    expect(a.creds.size).toBe(0);
    return store;
  };

  test("a marker whose passkey is gone throws PASSKEY_NOT_FOUND with one get, deletes the marker, creates nothing", async () => {
    const a = fakeAuthenticator();
    const store = stale(a);
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store }))).toBe("PASSKEY_NOT_FOUND");
    expect(a.calls).toEqual({ create: 0, get: 1 });
    expect(store.map.has(KEY)).toBe(false);
    expect(await rememberedPasskey({ rpId: "localhost", store })).toBeUndefined();
  });

  test("the call after PASSKEY_NOT_FOUND is a first visit again: it asks for a mode, then enrol works", async () => {
    const a = fakeAuthenticator();
    const store = stale(a);
    await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }));
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }))).toBe("CHOOSE_PASSKEY_MODE");
    const s = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(a.creds.size).toBe(1);
    expect(store.map.has(KEY)).toBe(true);
    expect(await s.fingerprint(memory)).toHaveLength(8);
  });

  test("the error carries the fix and the cause", async () => {
    const a = fakeAuthenticator();
    const e = await openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store: stale(a) }).catch((x: unknown) => x);
    expect(isSatchelError(e)).toBe(true);
    if (!isSatchelError(e)) return;
    expect(e.code).toBe("PASSKEY_NOT_FOUND");
    expect(e.fix).toContain("enrol()");
    expect(e.docs).toBe("/reference/errors#passkey-not-found");
    expect(isSatchelError(e.cause)).toBe(true);
  });

  test("a store without delete has the marker overwritten with an empty value, which reads as absent", async () => {
    const a = fakeAuthenticator();
    const map = new Map<string, Uint8Array>();
    map.set(KEY, new TextEncoder().encode(JSON.stringify({ credentialId: "Z29uZQ" })));
    const store: Store = { get: async (k) => map.get(k), put: async (k, v) => void map.set(k, v) };
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store }))).toBe("PASSKEY_NOT_FOUND");
    expect(map.get(KEY)?.length).toBe(0);
    expect(await rememberedPasskey({ rpId: "localhost", store })).toBeUndefined();
  });

  test("a store that cannot clear the marker is STORE_UNAVAILABLE, not a silent trap", async () => {
    const a = fakeAuthenticator();
    const store: Store = {
      get: async () => new TextEncoder().encode(JSON.stringify({ credentialId: "Z29uZQ" })),
      put: async () => { throw new Error("quota"); },
      delete: async () => { throw new Error("locked"); },
    };
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store }))).toBe("STORE_UNAVAILABLE");
  });

  test("a closed prompt with a live marker also forgets the marker and creates nothing; the passkey itself is untouched", async () => {
    const opts: { failWith?: string } = {};
    const a = fakeAuthenticator(opts);
    const store = memoryStore();
    await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    opts.failWith = "NotAllowedError";
    expect(await codeOf(() => openOrEnrol({ ...base, webAuthnClient: a.client, store }))).toBe("PASSKEY_NOT_FOUND");
    expect(a.calls.create).toBe(1);
    expect(a.creds.size).toBe(1);
    expect(store.map.has(KEY)).toBe(false);
    delete opts.failWith;
    const back = await openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client, store });
    expect(a.creds.size).toBe(1);
    expect(store.map.has(KEY)).toBe(true);
    back.close();
  });

  test("a live marker opens with one get and mode is ignored, so mode enrol never duplicates a passkey", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const first = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    const second = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(await second.fingerprint(memory)).toBe(await first.fingerprint(memory));
  });
});

describe("openOrEnrol: unchanged behaviour", () => {
  test("the marker holds only the public credential id", async () => {
    const a = fakeAuthenticator();
    const store = memoryStore();
    const s = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store });
    const marker = JSON.parse(new TextDecoder().decode(store.map.get(KEY)!)) as Record<string, unknown>;
    expect(Object.keys(marker).every((k) => k === "credentialId" || k === "transports")).toBe(true);
    expect(marker.credentialId).toBe(s.credential?.credentialId);
  });

  test("errors other than a closed prompt are thrown as they are and never enrol", async () => {
    const a = fakeAuthenticator();
    await enrol({ ...base, webAuthnClient: a.client });
    const noPrf = fakeAuthenticator({ noPrf: true });
    const created = a.calls.create;
    const securityError = { ...a.client, getCredential: async () => { throw Object.assign(new Error("x"), { name: "SecurityError" }); } };
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "open", webAuthnClient: securityError, store: memoryStore() }))).toBe("RPID_MISMATCH");
    expect(a.calls.create).toBe(created);
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "enrol", webAuthnClient: noPrf.client, store: memoryStore() }))).toBe("PRF_UNAVAILABLE");
  });

  test("an explicit credential skips the marker and the mode", async () => {
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
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store: unreadable }))).toBe("STORE_UNAVAILABLE");
    expect(await codeOf(() => rememberedPasskey({ rpId: "localhost", store: unreadable }))).toBe("STORE_UNAVAILABLE");
    expect(a.calls).toEqual({ create: 0, get: 0 });
    const unwritable = { get: async () => undefined, put: async () => { throw new Error("quota"); } };
    expect(await codeOf(() => openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client, store: unwritable }))).toBe("STORE_UNAVAILABLE");
  });

  test("in a runtime with no IndexedDB and no store the ceremony decides every time and nothing is written", async () => {
    const a = fakeAuthenticator();
    const first = await openOrEnrol({ ...base, mode: "enrol", webAuthnClient: a.client });
    expect(a.calls).toEqual({ create: 1, get: 0 });
    const again = await openOrEnrol({ ...base, mode: "open", webAuthnClient: a.client });
    expect(a.calls).toEqual({ create: 1, get: 1 });
    expect(await again.fingerprint(memory)).toBe(await first.fingerprint(memory));
    expect(await rememberedPasskey({ rpId: "localhost" })).toBeUndefined();
  });

  test("open() on its own is unchanged: it never enrols", async () => {
    const a = fakeAuthenticator();
    expect(await codeOf(() => open({ rpId: "localhost", webAuthnClient: a.client }))).toBe("PASSKEY_CANCELLED");
    expect(a.calls.create).toBe(0);
  });
});
