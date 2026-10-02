"use client";

import { createGrantee, parseSealed, SatchelError } from "@satchel/sdk";
import { toBytes } from "viem";
import type { StoredGrant, StoredMemory } from "./demo-store";

/** Fern's own identity: a P-256 key pair kept in Fern's own IndexedDB database. It never touches the passkey path. */
const DB = "fern";
const STORE = "kv";
const KEY = "grantee";

const done = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function db(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return done(req);
}

export async function fernIdentity() {
  const d = await db();
  const stored = await done<CryptoKeyPair | undefined>(d.transaction(STORE).objectStore(STORE).get(KEY));
  const grantee = await createGrantee(stored);
  if (!stored) await done(d.transaction(STORE, "readwrite").objectStore(STORE).put(grantee.keyPair, KEY));
  return grantee;
}

export type Fern = Awaited<ReturnType<typeof fernIdentity>>;

export type Row =
  | { id: string; at: number; epoch: number; size: number; state: "open"; text: string }
  | { id: string; at: number; epoch: number; size: number; state: "locked"; code: string; message: string };

/** Read every sealed memory through the grant that matches its epoch; a record newer than every grant comes back as the SDK's GRANT_REVOKED. */
export async function readMemories(fern: Fern, mine: StoredGrant[], memories: StoredMemory[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const m of memories) {
    const bytes = toBytes(m.hex);
    const head = parseSealed(bytes);
    const base = { id: m.id, at: m.at, epoch: head.epoch, size: bytes.length };
    const pick = mine.find((g) => g.grant.epoch === head.epoch) ?? [...mine].sort((a, b) => b.grant.epoch - a.grant.epoch)[0];
    if (!pick) continue;
    try {
      const out = await fern.reader(pick.grant).unsealJson<{ text: string }>(bytes);
      rows.push({ ...base, state: "open", text: out.text });
    } catch (e) {
      if (!(e instanceof SatchelError)) throw e;
      rows.push({ ...base, state: "locked", code: e.code, message: e.message });
    }
  }
  return rows;
}
