import type { Grant } from "satchel-sdk";
import type { Address, Hex } from "viem";

/**
 * Everything the demo apps keep in this browser is ciphertext, public, or a key the browser will not export.
 * Pip: a credential id, its registry address, its sealed memories (ciphertext) and the grants it issued (all of it is also on chain), in localStorage.
 * Fern: a non-extractable key pair and the transaction hashes of the grants it was given, in its own IndexedDB database. Fern does not read Pip's grants.
 * Fern reads sealed notes from the note bus when NEXT_PUBLIC_NOTE_BUS is set (two origins), else from Pip's localStorage on the same origin.
 */
const KEY = {
  credential: "satchel.pip.credential",
  owner: "satchel.pip.owner",
  memories: "satchel.pip.memories",
  grants: "satchel.demo.grants",
} as const;

export const FERN_DB = "fern";
export const FERN_STORE = "kv";
export const FERN_KEYS = { identity: "grantee", grants: "grants" } as const;

/** Where each thing lives, worded once. /fern and /guides/two-apps print these strings, so their copy follows the real key names. */
export const STORAGE = {
  memories: `localStorage key ${KEY.memories} (sealed bytes Pip wrote)`,
  fernIdentity: `IndexedDB database ${FERN_DB}, key ${FERN_KEYS.identity} (a non-extractable key pair)`,
  fernGrants: `IndexedDB database ${FERN_DB}, key ${FERN_KEYS.grants} (grant transaction hashes)`,
} as const;

export interface StoredCredential {
  credentialId: string;
  transports?: string[];
}
export interface StoredMemory {
  id: string;
  at: number;
  hex: Hex;
}
export interface StoredGrant {
  app: string;
  owner: Address;
  grant: Grant;
  revoked?: { epoch: number; txHash: Hex; at: number };
}

const read = <T>(k: string): T | undefined => {
  const raw = localStorage.getItem(k);
  return raw === null ? undefined : (JSON.parse(raw) as T);
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

export const credential = {
  get: () => read<StoredCredential>(KEY.credential),
  set: (c: StoredCredential) => write(KEY.credential, c),
};
export const owner = {
  get: () => read<Address>(KEY.owner),
  set: (a: Address) => write(KEY.owner, a),
};
export const memories = {
  list: () => read<StoredMemory[]>(KEY.memories) ?? [],
  add: (m: StoredMemory) => write(KEY.memories, [...memories.list(), m]),
};
export const grants = {
  list: () => read<StoredGrant[]>(KEY.grants) ?? [],
  add: (g: StoredGrant) => write(KEY.grants, [...grants.list(), g]),
  markRevoked: (id: string, r: NonNullable<StoredGrant["revoked"]>) =>
    write(KEY.grants, grants.list().map((g) => (g.grant.id === id ? { ...g, revoked: r } : g))),
};
