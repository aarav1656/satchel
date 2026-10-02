import { toBytes, toHex, type Hex } from "viem";
import { type Namespace, nsHashOf } from "./derive.js";
import { SatchelError } from "./errors.js";

const { subtle } = globalThis.crypto;
const MAGIC = [0x53, 0x41, 0x54, 0x31]; // "SAT1"
const VERSION = 1;
const HEADER = 4 + 1 + 32 + 8 + 12;
const TAG = 16;

/** Four plain header fields, then ciphertext. The namespace path is never in the bytes, only its hash. */
export interface Sealed {
  readonly v: 1;
  readonly nsHash: Hex;
  readonly epoch: number;
  toBytes(): Uint8Array;
}

class SealedBlob implements Sealed {
  readonly v = 1 as const;
  constructor(
    readonly nsHash: Hex,
    readonly epoch: number,
    private readonly bytes: Uint8Array,
  ) {}
  toBytes(): Uint8Array {
    return this.bytes.slice();
  }
}

export const asBytes = (b: Sealed | Uint8Array): Uint8Array => (b instanceof Uint8Array ? b : b.toBytes());

/** Throws NOT_SEALED on foreign bytes, SEAL_CORRUPT when the header is intact but the ciphertext cannot be a GCM output. */
export function parseSealed(b: Uint8Array): Sealed {
  if (!(b instanceof Uint8Array) || b.length < HEADER || MAGIC.some((m, i) => b[i] !== m)) {
    throw new SatchelError("NOT_SEALED", "These bytes are not a satchel blob: the SAT1 header is missing.");
  }
  if (b[4] !== VERSION) {
    throw new SatchelError("NOT_SEALED", `Unsupported satchel blob version ${b[4]}; this SDK reads version ${VERSION}.`);
  }
  const epoch = new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(37, false);
  if (epoch < 1n || epoch > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SatchelError("NOT_SEALED", "The blob header carries an impossible epoch.");
  }
  if (b.length < HEADER + TAG) {
    throw new SatchelError("SEAL_CORRUPT", "The blob is truncated: it is shorter than its header plus one GCM tag.");
  }
  return new SealedBlob(toHex(b.slice(5, 37)), Number(epoch), b.slice());
}

export function encodePlain(data: Uint8Array | string | object): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new TextEncoder().encode(typeof data === "string" ? data : JSON.stringify(data));
}

export async function sealWith(key: CryptoKey, n: Namespace, epoch: number, plain: Uint8Array): Promise<Sealed> {
  const out = new Uint8Array(HEADER + plain.length + TAG);
  out.set(MAGIC);
  out[4] = VERSION;
  out.set(toBytes(nsHashOf(n)), 5);
  new DataView(out.buffer).setBigUint64(37, BigInt(epoch), false);
  crypto.getRandomValues(out.subarray(45, HEADER));
  const header = out.slice(0, HEADER);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: "AES-GCM", iv: header.subarray(45), additionalData: header },
      key,
      plain as Uint8Array<ArrayBuffer>,
    ),
  );
  out.set(ct, HEADER);
  return new SealedBlob(toHex(header.slice(5, 37)), epoch, out);
}

/** AES-256-GCM open with AAD = the header bytes. Returns null on an authentication failure so the caller picks the code. */
export async function openWith(key: CryptoKey, blob: Uint8Array): Promise<Uint8Array | null> {
  try {
    const header = blob.slice(0, HEADER);
    return new Uint8Array(
      await subtle.decrypt(
        { name: "AES-GCM", iv: header.subarray(45), additionalData: header },
        key,
        blob.slice(HEADER) as Uint8Array<ArrayBuffer>,
      ),
    );
  } catch (e) {
    if (e instanceof Error && e.name === "OperationError") return null;
    throw e;
  }
}
