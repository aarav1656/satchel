import { SatchelError } from "./errors.js";

/** Holds ciphertext and public records only: wrapped root keys for added passkeys. Never a key in the clear. */
export interface Store {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, value: Uint8Array): Promise<void>;
  /** Removes a key. Optional: a store without it has the passkey marker overwritten with an empty value, which reads as absent. */
  delete?(key: string): Promise<void>;
}

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function db(): Promise<IDBDatabase> {
  const req = indexedDB.open("satchel", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("kv");
  return done(req);
}

export const indexedDbStore: Store = {
  async get(key) {
    const v = await done((await db()).transaction("kv").objectStore("kv").get(key));
    return v === undefined ? undefined : new Uint8Array(v as ArrayBuffer);
  },
  async put(key, value) {
    await done((await db()).transaction("kv", "readwrite").objectStore("kv").put(value.slice().buffer, key));
  },
  async delete(key) {
    await done((await db()).transaction("kv", "readwrite").objectStore("kv").delete(key));
  },
};

export function resolveStore(given: Store | undefined): Store {
  if (given) return given;
  if (typeof indexedDB !== "undefined") return indexedDbStore;
  throw new SatchelError("STORE_UNAVAILABLE", "No store was passed and this runtime has no IndexedDB.");
}
