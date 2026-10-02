import type { Grant } from "@satchel/sdk";
import type { Address, Hex } from "viem";

/** Everything the demo apps keep in this browser is ciphertext or public: a credential id, an address, grants that are also on chain. */
const KEY = {
  credential: "satchel.pip.credential",
  owner: "satchel.pip.owner",
  memories: "satchel.pip.memories",
  grants: "satchel.demo.grants",
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
