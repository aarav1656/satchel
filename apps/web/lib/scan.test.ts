import { expect, test } from "bun:test";
import { classifyIdb, classifyWebStorage } from "./scan";

const SEALED = "0x53415431" + "01" + "ab".repeat(80);

test("a sealed record is ciphertext", () => {
  expect(classifyWebStorage("localStorage", "x.blob", JSON.stringify(SEALED)).verdict).toBe("ciphertext");
});

test("the memories list is ciphertext only when every entry is a sealed record", () => {
  const good = JSON.stringify([{ id: "1", at: 1, hex: SEALED }]);
  const bad = JSON.stringify([{ id: "1", at: 1, hex: SEALED }, { id: "2", at: 2, hex: "0x" + "ab".repeat(32) }]);
  expect(classifyWebStorage("localStorage", "satchel.pip.memories", good).verdict).toBe("ciphertext");
  expect(classifyWebStorage("localStorage", "satchel.pip.memories", bad).verdict).toBe("flagged");
});

test("a credential record is public, and goes red when it grows a field", () => {
  expect(classifyWebStorage("localStorage", "satchel.pip.credential", JSON.stringify({ credentialId: "rvrNpQk5abc" })).verdict).toBe("public");
  expect(classifyWebStorage("localStorage", "satchel.pip.credential", JSON.stringify({ credentialId: "x", root: "0x" + "ab".repeat(32) })).verdict).toBe("flagged");
});

test("key-like data in the clear is flagged under any key, hex or base64", () => {
  expect(classifyWebStorage("localStorage", "proof.plain-test-value", "0x" + "ab".repeat(32)).verdict).toBe("flagged");
  expect(classifyWebStorage("sessionStorage", "anything", JSON.stringify({ privateKey: "q83vEjRWeJq83vEjRWeJq83vEjRWeJq83vEjRWeJq8w=" })).verdict).toBe("flagged");
});

test("a value satchel did not write and that is not key-like is other, not flagged", () => {
  expect(classifyWebStorage("sessionStorage", "ext.injection", JSON.stringify({ providers: ["a", "b"], enabled: true })).verdict).toBe("other");
});

test("an unrecognised value under a satchel key is flagged", () => {
  expect(classifyWebStorage("localStorage", "satchel.new.thing", JSON.stringify({ a: 1 })).verdict).toBe("flagged");
});

const buf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).buffer as ArrayBuffer;
const TX = "0x" + "ab".repeat(32);

test("the passkey marker openOrEnrol keeps is public, and goes red when it grows a field", () => {
  expect(classifyIdb("satchel/kv/satchel/known/localhost", "satchel/known/localhost", buf({ credentialId: "rvrNpQk5abc" })).verdict).toBe("public");
  expect(classifyIdb("satchel/kv/satchel/known/localhost", "satchel/known/localhost", buf({ credentialId: "x", root: "0x" + "cd".repeat(32) })).verdict).toBe("flagged");
  expect(classifyIdb("satchel/kv/satchel/known/localhost", "satchel/known/localhost", new TextEncoder().encode("not json").buffer as ArrayBuffer).verdict).toBe("flagged");
  expect(classifyIdb("satchel/kv/other", "other", buf({ credentialId: "x" })).verdict).toBe("flagged");
});

test("Fern's remembered grants are public only when every entry is a transaction hash", () => {
  expect(classifyIdb("fern/kv/grants", "grants", [TX, "0x" + "cd".repeat(32)]).verdict).toBe("public");
  expect(classifyIdb("fern/kv/grants", "grants", [TX, "0x" + "cd".repeat(31)]).verdict).toBe("flagged");
  expect(classifyIdb("fern/kv/grants", "grants", [TX, { wrappedKey: "0x" + "ab".repeat(113) }]).verdict).toBe("flagged");
  expect(classifyIdb("elsewhere/kv/grants", "grants", [TX]).verdict).toBe("flagged");
});

test("a wrapped root stays ciphertext, an unknown raw buffer stays flagged, key pairs follow extractability", () => {
  expect(classifyIdb("satchel/kv/satchel/wrap/localhost/abc", "satchel/wrap/localhost/abc", new ArrayBuffer(60)).verdict).toBe("ciphertext");
  expect(classifyIdb("x/kv/blob", "blob", new ArrayBuffer(60)).verdict).toBe("flagged");
  const pair = (extractable: boolean) => ({ privateKey: { extractable }, publicKey: {} }) as unknown;
  expect(classifyIdb("fern/kv/grantee", "grantee", pair(false)).verdict).toBe("public");
  expect(classifyIdb("fern/kv/grantee", "grantee", pair(true)).verdict).toBe("flagged");
});
