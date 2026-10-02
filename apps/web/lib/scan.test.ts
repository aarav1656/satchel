import { expect, test } from "bun:test";
import { classifyWebStorage } from "./scan";

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
