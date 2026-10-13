import { ns, parseSealed, type Satchel } from "satchel-sdk";
import { toBytes, toHex } from "viem";
import { MEMORY_NS } from "./config";
import type { StoredMemory } from "./demo-store";

/** The registry read a seal depends on has not caught up with a revoke that already confirmed. Retrying later succeeds. */
export class EpochBehind extends Error {}

/** Where sealed memories land: the page's storage and, when configured, the note bus. Both take ciphertext rows only. */
export interface MemoryStore {
  list(): StoredMemory[];
  add(m: StoredMemory): void;
  replace(all: StoredMemory[]): void;
}

export interface Plain {
  text: string;
  at: number;
}

/** Seals one fact under the memory namespace and hands the store the ciphertext row. The plaintext never reaches the store. */
export async function sealFact(s: Pick<Satchel, "seal">, text: string, store: Pick<MemoryStore, "add">, at = Date.now()) {
  const sealed = await s.seal(ns(MEMORY_NS), { text, at } satisfies Plain);
  const bytes = sealed.toBytes();
  const stored: StoredMemory = { id: `${at}-${toHex(bytes.slice(-4)).slice(2)}`, at, hex: toHex(bytes) };
  store.add(stored);
  return { stored, epoch: sealed.epoch, size: bytes.length };
}

/**
 * After a revoke the registry is at a new epoch. Opens every stored memory with the owner key and seals it again at that epoch,
 * then swaps the store's rows for the new ciphertext. A grant from before the revoke opens epoch-1 bytes only, and none remain in the store.
 * Everything is sealed before anything is replaced, so a failure part-way leaves the store as it was.
 */
export async function resealAll(s: Pick<Satchel, "seal" | "unsealJson">, store: Pick<MemoryStore, "list" | "replace">, atLeastEpoch: number) {
  const n = ns(MEMORY_NS);
  const next: StoredMemory[] = [];
  for (const m of store.list()) {
    const plain = await s.unsealJson<Plain>(n, toBytes(m.hex));
    const sealed = await s.seal(n, plain);
    if (sealed.epoch < atLeastEpoch) {
      throw new EpochBehind(`reseal produced epoch ${sealed.epoch}, expected at least ${atLeastEpoch}; the registry read is behind the revoke`);
    }
    next.push({ id: m.id, at: m.at, hex: toHex(sealed.toBytes()) });
  }
  store.replace(next);
  return { count: next.length, epoch: next[0] ? parseSealed(toBytes(next[0].hex)).epoch : atLeastEpoch };
}
