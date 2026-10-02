import {
  type PasskeyCredentialMetadata,
  type WebAuthnClient,
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { aesKey, dekBytes, dekKey, fingerprintOf, hkdfBits, type Namespace, nsHashOf, ownerKeyHex } from "./derive.js";
import { SatchelError } from "./errors.js";
import { type Grant, type GranteePublicKey, granteeKeyHash, importPublic, wrapDek } from "./grant.js";
import { epochOf, grantOnChain, type Registry, revokeOnChain } from "./registry.js";
import { asBytes, encodePlain, openWith, parseSealed, sealWith, type Sealed } from "./sealed.js";
import { resolveStore, type Store } from "./store.js";

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();

export interface OpenOptions {
  /** Must equal the rpId the passkey was created under. */
  rpId: string;
  /** Mera's credential metadata; omit to let the browser pick. */
  credential?: PasskeyCredentialMetadata;
  /** Ciphertext store for added passkeys. Default: IndexedDB. */
  store?: Store;
  /** Epoch registry. Without it every namespace stays at epoch 1 and grant/revoke are unavailable. */
  registry?: Registry;
  /** Runs the WebAuthn ceremonies. Default: the browser's navigator.credentials. */
  webAuthnClient?: WebAuthnClient;
  /** Demand that the chosen passkey is one added with addPasskey(). Throws NO_SECOND_PASSKEY if it is not. */
  recover?: boolean;
}

export interface Satchel {
  readonly credential: PasskeyCredentialMetadata | undefined;
  /** The EOA that owns this vault's namespaces in the registry. Fund it to pay for grant and revoke. */
  readonly registryOwner: Address;
  seal(n: Namespace, data: Uint8Array | string | object): Promise<Sealed>;
  unseal(n: Namespace, blob: Sealed | Uint8Array): Promise<Uint8Array>;
  unsealJson<T = unknown>(n: Namespace, blob: Sealed | Uint8Array): Promise<T>;
  fingerprint(n: Namespace): Promise<string>;
  addPasskey(o: { appName: string }): Promise<void>;
  grant(n: Namespace, to: GranteePublicKey, o: { label: string }): Promise<Grant>;
  revoke(n: Namespace, grantId: string): Promise<{ epoch: number; txHash: Hex }>;
  close(): void;
}

const wrapKeyName = (rpId: string, credentialId: string) => `satchel/wrap/${rpId}/${credentialId}`;
const wrapAad = (rpId: string, credentialId: string) => enc.encode(`satchel/wrap/v1|${rpId}|${credentialId}`);

/** Key that wraps the root for an added passkey. Zeroes the PRF output it was given. */
async function wrapKek(prf: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const raw = await hkdfBits(prf, "satchel/wrap/v1");
  prf.fill(0);
  try {
    return await aesKey(raw, [usage]);
  } finally {
    raw.fill(0);
  }
}

/** Maps Mera's coarse PASSKEY_OPERATION_FAILED onto the WebAuthn failure that caused it. */
async function ceremony<T>(rpId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMeraError(e)) throw e;
    if (e.code === "PRF_UNAVAILABLE") throw new SatchelError("PRF_UNAVAILABLE", "This passkey cannot derive keys: the authenticator returned no 32 byte PRF output.", { cause: e });
    if (e.code === "PASSKEY_OPERATION_FAILED") {
      const name = (e.cause as { name?: string } | undefined)?.name;
      if (name === "SecurityError") {
        throw new SatchelError("RPID_MISMATCH", `rpId "${rpId}" has no satchel passkey. A passkey works only under the rpId it was created for.`, { cause: e });
      }
      throw new SatchelError("PASSKEY_CANCELLED", "Passkey prompt closed or no matching passkey was offered.", { cause: e });
    }
    throw e;
  }
}

class SatchelImpl implements Satchel {
  private closed = false;
  constructor(
    private readonly root: Uint8Array,
    readonly registryOwner: Address,
    readonly credential: PasskeyCredentialMetadata | undefined,
    private readonly o: OpenOptions,
  ) {}

  private live(): Uint8Array {
    if (this.closed) throw new SatchelError("SESSION_CLOSED", "This satchel was closed; its key material is zeroed.");
    return this.root;
  }

  private requireRegistry(): Registry {
    if (!this.o.registry) {
      throw new SatchelError("REGISTRY_UNREACHABLE", "No registry is configured on this satchel.", { fix: "pass registry: { address } in OpenOptions." });
    }
    return this.o.registry;
  }

  async seal(n: Namespace, data: Uint8Array | string | object): Promise<Sealed> {
    const root = this.live();
    const epoch = this.o.registry ? await epochOf(this.o.registry, this.registryOwner, nsHashOf(n)) : 1;
    return sealWith(await dekKey(root, n, epoch), n, epoch, encodePlain(data));
  }

  async unseal(n: Namespace, blob: Sealed | Uint8Array): Promise<Uint8Array> {
    const root = this.live();
    const bytes = asBytes(blob);
    const head = parseSealed(bytes);
    if (head.nsHash !== nsHashOf(n)) {
      throw new SatchelError("NAMESPACE_MISMATCH", `Blob is sealed under namespace hash ${head.nsHash}, asked for "${n}" (${nsHashOf(n)}).`);
    }
    const plain = await openWith(await dekKey(root, n, head.epoch), bytes);
    if (!plain) {
      throw new SatchelError(
        "WRONG_PASSKEY",
        `This passkey did not seal ns "${n}" at epoch ${head.epoch}, or the ciphertext was altered. Nothing was decrypted.`,
      );
    }
    return plain;
  }

  async unsealJson<T = unknown>(n: Namespace, blob: Sealed | Uint8Array): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await this.unseal(n, blob))) as T;
  }

  fingerprint(n: Namespace): Promise<string> {
    return fingerprintOf(this.live(), n);
  }

  async addPasskey({ appName }: { appName: string }): Promise<void> {
    const root = this.live();
    const store = resolveStore(this.o.store);
    const made = await ceremony(this.o.rpId, () =>
      createPasskeyWithPrfOutput({
        rp: { id: this.o.rpId, name: appName },
        user: { name: appName, displayName: appName },
        ...(this.o.webAuthnClient ? { webAuthnClient: this.o.webAuthnClient } : {}),
      }),
    );
    const kek = await wrapKek(made.prfOutput, "encrypt");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(
      await subtle.encrypt({ name: "AES-GCM", iv, additionalData: wrapAad(this.o.rpId, made.credentialId) }, kek, root as Uint8Array<ArrayBuffer>),
    );
    try {
      await store.put(wrapKeyName(this.o.rpId, made.credentialId), new Uint8Array([...iv, ...ct]));
    } catch (cause) {
      throw new SatchelError("STORE_UNAVAILABLE", "The store refused the wrapped key for the new passkey.", { cause });
    }
  }

  async grant(n: Namespace, to: GranteePublicKey, o: { label: string }): Promise<Grant> {
    const root = this.live();
    const registry = this.requireRegistry();
    await importPublic(to);
    const nsHash = nsHashOf(n);
    const epoch = await epochOf(registry, this.registryOwner, nsHash);
    const dek = await dekBytes(root, n, epoch);
    let wrappedKey: Hex;
    try {
      wrappedKey = await wrapDek(to, dek, nsHash, epoch);
    } finally {
      dek.fill(0);
    }
    const keyHash = granteeKeyHash(to);
    const out = await grantOnChain(registry, await ownerKeyHex(root), nsHash, keyHash, wrappedKey, o.label);
    if (out.epoch !== epoch) {
      throw new SatchelError(
        "REGISTRY_UNREACHABLE",
        `The namespace epoch moved from ${epoch} to ${out.epoch} while grant ${out.grantId} was in flight, so its wrapped key does not match.`,
        { fix: `revoke grant ${out.grantId} and call grant() again.` },
      );
    }
    return { id: out.grantId.toString(), ns: n, nsHash, epoch, granteeKeyHash: keyHash, wrappedKey, label: o.label, txHash: out.txHash };
  }

  async revoke(n: Namespace, grantId: string): Promise<{ epoch: number; txHash: Hex }> {
    const root = this.live();
    const registry = this.requireRegistry();
    let id: bigint;
    try {
      id = BigInt(grantId);
    } catch (cause) {
      throw new SatchelError("REGISTRY_UNREACHABLE", `Grant id ${JSON.stringify(grantId)} is not a decimal integer.`, { cause, fix: "pass the id of a Grant returned by grant()." });
    }
    return revokeOnChain(registry, await ownerKeyHex(root), nsHashOf(n), id);
  }

  close(): void {
    this.root.fill(0);
    this.closed = true;
  }
}

async function build(root: Uint8Array, credential: PasskeyCredentialMetadata | undefined, o: OpenOptions): Promise<Satchel> {
  const address = privateKeyToAccount(await ownerKeyHex(root)).address;
  return new SatchelImpl(root, address, credential, o);
}

/**
 * Build a satchel from a 32 byte PRF output you already hold (tests, server-side readers of a vault the
 * passkey opened elsewhere). The satchel takes ownership of `prf` and zeroes it on close().
 */
export async function fromPrfOutput(prf: Uint8Array, o: OpenOptions): Promise<Satchel> {
  if (!(prf instanceof Uint8Array) || prf.length !== 32) {
    throw new SatchelError("PRF_UNAVAILABLE", "A PRF output is exactly 32 bytes.");
  }
  return build(prf, o.credential, o);
}

async function fromCeremony(credentialId: string, prf: Uint8Array, base: PasskeyCredentialMetadata, o: OpenOptions): Promise<Satchel> {
  let store: Store | undefined;
  try {
    store = resolveStore(o.store);
  } catch (e) {
    // No store in this runtime means no added passkeys to look up; only recovery needs one.
    if (o.recover) {
      prf.fill(0);
      throw new SatchelError("NO_SECOND_PASSKEY", "No store holds a second passkey for this vault.", { cause: e });
    }
  }
  let wrapped: Uint8Array | undefined;
  try {
    wrapped = store ? await store.get(wrapKeyName(o.rpId, credentialId)) : undefined;
  } catch (cause) {
    prf.fill(0);
    throw new SatchelError("STORE_UNAVAILABLE", "The store could not be read for an added passkey.", { cause });
  }
  if (!wrapped) {
    if (o.recover) {
      prf.fill(0);
      throw new SatchelError("NO_SECOND_PASSKEY", "The chosen passkey was never added to this vault with addPasskey(). Lost passkey, lost data.");
    }
    return build(prf, base, o);
  }
  const kek = await wrapKek(prf, "decrypt");
  const root = await openWith2(kek, wrapped, wrapAad(o.rpId, credentialId));
  return build(root, base, o);
}

async function openWith2(kek: CryptoKey, wrapped: Uint8Array, aad: Uint8Array): Promise<Uint8Array> {
  try {
    return new Uint8Array(
      await subtle.decrypt({ name: "AES-GCM", iv: wrapped.slice(0, 12), additionalData: aad as Uint8Array<ArrayBuffer> }, kek, wrapped.slice(12)),
    );
  } catch (cause) {
    throw new SatchelError("WRONG_PASSKEY", "The stored wrap for this passkey failed authentication.", { cause });
  }
}

/** Existing passkey, one prompt. */
export async function open(o: OpenOptions): Promise<Satchel> {
  const got = await ceremony(o.rpId, () =>
    getPasskeyPrfOutput({
      rpId: o.rpId,
      ...(o.credential ? { credential: o.credential } : {}),
      ...(o.webAuthnClient ? { webAuthnClient: o.webAuthnClient } : {}),
    }),
  );
  return fromCeremony(got.credentialId, got.prfOutput, { credentialId: got.credentialId }, o);
}

/** New passkey with PRF, one prompt (two on authenticators that skip PRF at creation, per Mera). */
export async function enrol(o: OpenOptions & { appName: string }): Promise<Satchel> {
  const made = await ceremony(o.rpId, () =>
    createPasskeyWithPrfOutput({
      rp: { id: o.rpId, name: o.appName },
      user: { name: o.appName, displayName: o.appName },
      ...(o.webAuthnClient ? { webAuthnClient: o.webAuthnClient } : {}),
    }),
  );
  const credential: PasskeyCredentialMetadata = { credentialId: made.credentialId, ...(made.transports ? { transports: made.transports } : {}) };
  return build(made.prfOutput, credential, o);
}
