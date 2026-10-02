import { keccak256, toBytes, toHex, type Hex } from "viem";
import { SatchelError } from "./errors.js";

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

export const SALT = enc.encode("satchel/v1");
export const NS_INFO = "satchel/ns/";
const OWNER_INFO = "satchel/owner/secp256k1";
const DEK_INFO = "satchel/dek/";
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** A namespace is a path, validated once. It is the HKDF info string and the unit of a grant. */
export type Namespace = string & { readonly __brand: "satchel.ns" };

export function ns(path: string): Namespace {
  if (typeof path !== "string" || path.length < 3 || path.length > 64 || !/^[a-z0-9]+([/-][a-z0-9]+)*$/.test(path)) {
    throw new SatchelError(
      "INVALID_NAMESPACE",
      `${JSON.stringify(path)} is not a namespace. A namespace is 3 to 64 characters matching /^[a-z0-9]+([/-][a-z0-9]+)*$/.`,
    );
  }
  return path as Namespace;
}

const buf = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

export async function hkdfBits(ikm: Uint8Array, info: string): Promise<Uint8Array> {
  const key = await subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: SALT, info: enc.encode(info) }, key, 256);
  return new Uint8Array(bits);
}

export const nsHashOf = (n: Namespace): Hex => keccak256(toBytes(NS_INFO + n));

/** Namespace key: HKDF(prf, salt "satchel/v1", info "satchel/ns/" + path). */
export const nsKeyBytes = (root: Uint8Array, n: Namespace) => hkdfBits(root, NS_INFO + n);

/** Per-epoch data key: HKDF(nsKey, info "satchel/dek/" + epoch). Raw bytes, caller zeroes them. */
export async function dekBytes(root: Uint8Array, n: Namespace, epoch: number): Promise<Uint8Array> {
  const nsKey = await nsKeyBytes(root, n);
  try {
    return await hkdfBits(nsKey, DEK_INFO + epoch);
  } finally {
    nsKey.fill(0);
  }
}

export const aesKey = (raw: Uint8Array, usages: KeyUsage[]) =>
  subtle.importKey("raw", buf(raw), "AES-GCM", false, usages);

export async function dekKey(root: Uint8Array, n: Namespace, epoch: number): Promise<CryptoKey> {
  const raw = await dekBytes(root, n, epoch);
  try {
    return await aesKey(raw, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

/** Registry owner key: HKDF(prf, info "satchel/owner/secp256k1") reduced into the secp256k1 order. */
export async function ownerKeyHex(root: Uint8Array): Promise<Hex> {
  const raw = await hkdfBits(root, OWNER_INFO);
  const k = BigInt(toHex(raw)) % SECP256K1_N;
  raw.fill(0);
  if (k === 0n) throw new SatchelError("PRF_UNAVAILABLE", "Derived owner key is zero; this PRF output is unusable.");
  return `0x${k.toString(16).padStart(64, "0")}`;
}

/** 8 hex chars of SHA-256("satchel/fp/v1" || nsKey): safe to show, matches across devices. */
export async function fingerprintOf(root: Uint8Array, n: Namespace): Promise<string> {
  const key = await nsKeyBytes(root, n);
  const input = new Uint8Array(13 + key.length);
  input.set(enc.encode("satchel/fp/v1"));
  input.set(key, 13);
  key.fill(0);
  const digest = new Uint8Array(await subtle.digest("SHA-256", input));
  input.fill(0);
  return toHex(digest.slice(0, 4)).slice(2);
}
