"use client";

import { createGrantee, fetchGrant, ns, parseSealed, SatchelError, type FetchedGrant } from "satchel-sdk";
import { keccak256, toBytes, type Hex } from "viem";
import { MEMORY_NS, NOTE_BUS_URL, REGISTRY } from "./config";
import { FERN_DB, FERN_KEYS, FERN_STORE, memories, type StoredMemory } from "./demo-store";
import { fetchNotes } from "./note-bus";

const done = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function db(): Promise<IDBDatabase> {
  const req = indexedDB.open(FERN_DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(FERN_STORE);
  return done(req);
}

const get = async <T,>(key: string) => done<T | undefined>((await db()).transaction(FERN_STORE).objectStore(FERN_STORE).get(key));
const put = async (key: string, value: unknown) => void (await done((await db()).transaction(FERN_STORE, "readwrite").objectStore(FERN_STORE).put(value, key)));

/** Fern's own identity: a P-256 key pair kept in Fern's own IndexedDB database. It never touches the passkey path. */
export async function fernIdentity() {
  const stored = await get<CryptoKeyPair>(FERN_KEYS.identity);
  const grantee = await createGrantee(stored);
  if (!stored) await put(FERN_KEYS.identity, grantee.keyPair);
  return grantee;
}

export type Fern = Awaited<ReturnType<typeof fernIdentity>>;

export const isTxHash = (v: string | null | undefined): v is Hex => v !== null && v !== undefined && /^0x[0-9a-fA-F]{64}$/.test(v);

/** The transaction hashes of the grants Fern was given. A hash is public: it is the grant, rebuilt from the chain. */
export const fernGrantTxs = async (): Promise<Hex[]> => (await get<Hex[]>(FERN_KEYS.grants)) ?? [];

const readGrant = (txHash: Hex) => fetchGrant({ txHash, registry: REGISTRY, ns: ns(MEMORY_NS) });

/**
 * Takes a grant from its transaction hash: rebuilds it from the chain and proves it opens with Fern's key before remembering the hash.
 * A hash for another app's key throws GRANT_NOT_FOR_KEY here, so it is never stored.
 */
export async function acceptGrant(fern: Fern, txHash: Hex): Promise<void> {
  fern.reader(await readGrant(txHash));
  const have = await fernGrantTxs();
  if (!have.some((h) => h.toLowerCase() === txHash.toLowerCase())) await put(FERN_KEYS.grants, [...have, txHash]);
}

/** Rebuilds every remembered grant from its transaction receipt, newest id last. */
export async function loadGrants(): Promise<FetchedGrant[]> {
  const out: FetchedGrant[] = [];
  for (const tx of await fernGrantTxs()) out.push(await readGrant(tx));
  return out.sort((a, b) => Number(a.id) - Number(b.id));
}

export type Row =
  | { id: string; at: number; epoch: number; size: number; state: "open"; text: string }
  | { id: string; at: number; epoch: number; size: number; state: "locked"; code: string; message: string };

/** Pick the grant that may open a blob at `recordEpoch`. Fails closed when the record is newer than every grant. */
export function grantForRecord(mine: FetchedGrant[], recordEpoch: number): FetchedGrant | undefined {
  const exact = mine.find((g) => g.epoch === recordEpoch);
  if (exact) return exact;
  const sorted = [...mine].sort((a, b) => b.epoch - a.epoch);
  const newest = sorted[0];
  if (!newest || recordEpoch > newest.epoch) return undefined;
  return newest;
}

export async function loadSealedNotes(): Promise<StoredMemory[]> {
  if (NOTE_BUS_URL) return fetchNotes(NOTE_BUS_URL);
  return memories.list();
}

/** Read every sealed memory through the grant that matches its epoch; a record newer than every grant comes back as the SDK's GRANT_REVOKED. */
export async function readMemories(fern: Fern, mine: FetchedGrant[], sealed: StoredMemory[]): Promise<Row[]> {
  const rows: Row[] = [];
  for (const m of sealed) {
    const bytes = toBytes(m.hex);
    const head = parseSealed(bytes);
    const base = { id: m.id, at: m.at, epoch: head.epoch, size: bytes.length };
    const pick = grantForRecord(mine, head.epoch);
    if (!pick) {
      rows.push({
        ...base,
        state: "locked",
        code: "GRANT_REVOKED",
        message: `No grant covers epoch ${head.epoch}.`,
      });
      continue;
    }
    try {
      const out = await fern.reader(pick).unsealJson<{ text: string }>(bytes);
      rows.push({ ...base, state: "open", text: out.text });
    } catch (e) {
      if (!(e instanceof SatchelError)) throw e;
      rows.push({ ...base, state: "locked", code: e.code, message: e.message });
    }
  }
  return rows;
}

export const keyHashOf = (fern: Fern) => keccak256(fern.publicKey);
