import { Aes128Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import { type Hex, hexToBytes, keccak256, toHex } from "viem";
import { aesKey, type Namespace } from "./derive.js";
import { SatchelError } from "./errors.js";
import { asBytes, openWith, parseSealed, type Sealed } from "./sealed.js";

const { subtle } = globalThis.crypto;
const suite = new CipherSuite({ kem: new DhkemP256HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes128Gcm() });
const HPKE_INFO = new TextEncoder().encode("satchel/grant/v1");

/** The grantee's P-256 public key, 65 bytes uncompressed, 0x-hex. Safe to send over any channel. */
export type GranteePublicKey = Hex;

/** What the owner hands the reader. Everything in it is also on chain in the Granted event. */
export interface Grant {
  id: string;
  ns: Namespace;
  nsHash: Hex;
  epoch: number;
  granteeKeyHash: Hex;
  wrappedKey: Hex;
  label: string;
  txHash: Hex;
}

export interface Reader {
  unseal(blob: Sealed | Uint8Array): Promise<Uint8Array>;
  unsealJson<T = unknown>(blob: Sealed | Uint8Array): Promise<T>;
}

export const granteeKeyHash = (pub: GranteePublicKey): Hex => keccak256(pub);

const aad = (nsHash: Hex, epoch: number) => {
  const out = new Uint8Array(40);
  out.set(hexToBytes(nsHash));
  new DataView(out.buffer).setBigUint64(32, BigInt(epoch), false);
  return out;
};

export async function importPublic(pub: GranteePublicKey): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = hexToBytes(pub);
  } catch (cause) {
    throw new SatchelError("INVALID_GRANTEE_KEY", "The grantee key is not hex.", { cause });
  }
  if (raw.length !== 65 || raw[0] !== 4) {
    throw new SatchelError("INVALID_GRANTEE_KEY", "The grantee key must be a 65 byte uncompressed P-256 point.");
  }
  try {
    return await suite.kem.deserializePublicKey(raw as Uint8Array<ArrayBuffer>);
  } catch (cause) {
    throw new SatchelError("INVALID_GRANTEE_KEY", "The grantee key is not a point on P-256.", { cause });
  }
}

/** HPKE (RFC 9180, DHKEM P-256, HKDF-SHA256, AES-128-GCM) seal of the epoch data key. Output is enc (65) || ciphertext (48). */
export async function wrapDek(pub: GranteePublicKey, dek: Uint8Array, nsHash: Hex, epoch: number): Promise<Hex> {
  const recipientPublicKey = await importPublic(pub);
  const { enc, ct } = await suite.seal({ recipientPublicKey, info: HPKE_INFO }, dek as Uint8Array<ArrayBuffer>, aad(nsHash, epoch));
  return toHex(new Uint8Array([...new Uint8Array(enc), ...new Uint8Array(ct)]));
}

/**
 * The app on the other side of a grant. It holds its own key and never touches the passkey.
 * Pass `keyPair` to keep a grantee identity across page loads (a non-extractable CryptoKey can live in IndexedDB).
 */
export async function createGrantee(keyPair?: CryptoKeyPair): Promise<{
  publicKey: GranteePublicKey;
  keyPair: CryptoKeyPair;
  reader(g: Grant): Reader;
}> {
  const pair = keyPair ?? (await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]));
  const publicKey = toHex(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
  const mine = granteeKeyHash(publicKey);
  return {
    publicKey,
    keyPair: pair,
    reader(g) {
      if (g.granteeKeyHash.toLowerCase() !== mine.toLowerCase()) {
        throw new SatchelError("GRANT_NOT_FOR_KEY", "This grant was issued to another app key.");
      }
      let dek: Promise<CryptoKey> | undefined;
      const unwrap = () =>
        (dek ??= (async () => {
          const wrapped = hexToBytes(g.wrappedKey);
          try {
            const raw = new Uint8Array(
              await suite.open(
                { recipientKey: pair.privateKey, enc: wrapped.slice(0, 65), info: HPKE_INFO },
                wrapped.slice(65),
                aad(g.nsHash, g.epoch),
              ),
            );
            const key = await aesKey(raw, ["decrypt"]);
            raw.fill(0);
            return key;
          } catch (cause) {
            throw new SatchelError("GRANT_NOT_FOR_KEY", "This grant could not be opened with this app key.", { cause });
          }
        })());
      const unseal = async (blob: Sealed | Uint8Array) => {
        const bytes = asBytes(blob);
        const head = parseSealed(bytes);
        if (head.nsHash !== g.nsHash) {
          throw new SatchelError("NAMESPACE_MISMATCH", `Blob is sealed under namespace hash ${head.nsHash}, this grant covers ${g.ns} (${g.nsHash}).`);
        }
        if (head.epoch > g.epoch) {
          throw new SatchelError(
            "GRANT_REVOKED",
            `Grant covers epoch ${g.epoch} only; this record is epoch ${head.epoch}. The owner rotated the namespace after this grant.`,
          );
        }
        if (head.epoch < g.epoch) {
          throw new SatchelError("GRANT_EPOCH_OLDER", `Grant covers epoch ${g.epoch}; this record is epoch ${head.epoch}, which this grant cannot derive.`);
        }
        const plain = await openWith(await unwrap(), bytes);
        if (!plain) {
          throw new SatchelError("SEAL_CORRUPT", "Ciphertext failed authentication. It was altered or truncated. Nothing was decrypted.");
        }
        return plain;
      };
      return {
        unseal,
        unsealJson: async <T>(blob: Sealed | Uint8Array) => JSON.parse(new TextDecoder().decode(await unseal(blob))) as T,
      };
    },
  };
}

