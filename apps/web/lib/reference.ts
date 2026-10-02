import type { ErrorCode } from "@satchel/sdk";

export interface Param {
  name: string;
  type: string;
  doc: string;
}
export interface Entry {
  /** The name as exported from the package root, or `Satchel.seal` style for a member. scripts/prebuild.mjs compares these with dist/index.d.ts and the Satchel interface. */
  name: string;
  anchor: string;
  kind: "function" | "method" | "type" | "interface" | "class";
  signature: string;
  summary: string;
  params?: Param[];
  returns?: string;
  /** Present on every function and method, empty when it cannot throw a SatchelError. */
  throws?: ErrorCode[];
  note?: string;
}
export interface Section {
  title: string;
  blurb: string;
  entries: Entry[];
}

const a = (name: string) => name.toLowerCase().replaceAll(".", "-");

export const SECTIONS: Section[] = [
  {
    title: "Namespaces and sessions",
    blurb: "A namespace is a path. A session is one passkey ceremony.",
    entries: [
      {
        name: "Namespace",
        anchor: a("Namespace"),
        kind: "type",
        signature: `type Namespace = string & { readonly __brand: "satchel.ns" }`,
        summary: "A validated path. The brand makes a raw string a type error where a Namespace is expected.",
      },
      {
        name: "ns",
        anchor: a("ns"),
        kind: "function",
        signature: "function ns(path: string): Namespace",
        summary: "Validates a path once. The path is the HKDF info string (prefixed with satchel/ns/) and the unit of a grant.",
        params: [{ name: "path", type: "string", doc: "3 to 64 characters matching /^[a-z0-9]+([/-][a-z0-9]+)*$/, for example memory/assistant." }],
        returns: "The same string, branded as a Namespace.",
        throws: ["INVALID_NAMESPACE"],
      },
      {
        name: "OpenOptions",
        anchor: a("OpenOptions"),
        kind: "interface",
        signature: `interface OpenOptions {
  rpId: string;
  credential?: PasskeyCredentialMetadata;
  store?: Store;
  registry?: Registry;
  webAuthnClient?: WebAuthnClient;
  recover?: boolean;
}`,
        summary: "Options shared by open() and enrol().",
        params: [
          { name: "rpId", type: "string", doc: "Must equal the rpId the passkey was created under, usually location.hostname of your production origin." },
          { name: "credential", type: "PasskeyCredentialMetadata", doc: "Mera's credential metadata. Omit to let the browser offer a passkey." },
          { name: "store", type: "Store", doc: "Where wrapped roots for added passkeys live. Default: IndexedDB." },
          { name: "registry", type: "Registry", doc: "The epoch registry. Without it every namespace stays at epoch 1 and grant and revoke are unavailable." },
          { name: "webAuthnClient", type: "WebAuthnClient", doc: "Runs the WebAuthn ceremonies. Default: the browser's navigator.credentials." },
          { name: "recover", type: "boolean", doc: "Demand that the chosen passkey is one added with addPasskey(). Throws NO_SECOND_PASSKEY if it is not." },
        ],
      },
      {
        name: "open",
        anchor: a("open"),
        kind: "function",
        signature: "function open(o: OpenOptions): Promise<Satchel>",
        summary: "Opens a vault with an existing passkey. One passkey prompt.",
        returns: "A Satchel holding the root in memory until close().",
        throws: ["PRF_UNAVAILABLE", "RPID_MISMATCH", "PASSKEY_CANCELLED", "NO_SECOND_PASSKEY", "WRONG_PASSKEY", "STORE_UNAVAILABLE"],
      },
      {
        name: "enrol",
        anchor: a("enrol"),
        kind: "function",
        signature: "function enrol(o: OpenOptions & { appName: string }): Promise<Satchel>",
        summary: "Creates a passkey with PRF and opens a vault with it. One prompt, two on authenticators that skip PRF at creation (Mera does the second ceremony).",
        params: [{ name: "appName", type: "string", doc: "Shown on the passkey sheet, for example Satchel vault for Pip." }],
        returns: "A Satchel.",
        throws: ["PRF_UNAVAILABLE", "RPID_MISMATCH", "PASSKEY_CANCELLED"],
      },
      {
        name: "fromPrfOutput",
        anchor: a("fromPrfOutput"),
        kind: "function",
        signature: "function fromPrfOutput(prf: Uint8Array, o: OpenOptions): Promise<Satchel>",
        summary: "Builds a session from a 32 byte PRF output you already hold, for tests and for server-side readers of a vault the passkey opened elsewhere. The session takes ownership of the array and zeroes it on close().",
        params: [{ name: "prf", type: "Uint8Array", doc: "Exactly 32 bytes." }],
        returns: "A Satchel.",
        throws: ["PRF_UNAVAILABLE"],
      },
    ],
  },
  {
    title: "The Satchel session",
    blurb: "What you do once a passkey has opened the vault. Methods are anchored as satchel-<name>.",
    entries: [
      {
        name: "Satchel",
        anchor: a("Satchel"),
        kind: "interface",
        signature: `interface Satchel {
  readonly credential: PasskeyCredentialMetadata | undefined;
  readonly registryOwner: Address;
  seal(n: Namespace, data: Uint8Array | string | object): Promise<Sealed>;
  unseal(n: Namespace, blob: Sealed | Uint8Array): Promise<Uint8Array>;
  unsealJson<T = unknown>(n: Namespace, blob: Sealed | Uint8Array): Promise<T>;
  fingerprint(n: Namespace): Promise<string>;
  addPasskey(o: { appName: string }): Promise<void>;
  grant(n: Namespace, to: GranteePublicKey, o: { label: string }): Promise<Grant>;
  revoke(n: Namespace, grantId: string): Promise<{ epoch: number; txHash: Hex }>;
  close(): void;
}`,
        summary: "An open vault. Key material is derived on demand from the root and zeroed after use; close() zeroes the root.",
        params: [
          { name: "credential", type: "PasskeyCredentialMetadata | undefined", doc: "The passkey that opened this session." },
          { name: "registryOwner", type: "Address", doc: "The EOA that owns this vault's namespaces in the registry. Fund it to pay for grant and revoke." },
        ],
      },
      {
        name: "Satchel.seal",
        anchor: a("Satchel.seal"),
        kind: "method",
        signature: "seal(n: Namespace, data: Uint8Array | string | object): Promise<Sealed>",
        summary: "Encrypts under the namespace's current epoch key. Objects are JSON encoded. With a registry configured it reads the current epoch from chain first; without one the epoch is 1.",
        returns: "A Sealed that is safe to store anywhere.",
        throws: ["SESSION_CLOSED", "REGISTRY_UNREACHABLE"],
      },
      {
        name: "Satchel.unseal",
        anchor: a("Satchel.unseal"),
        kind: "method",
        signature: "unseal(n: Namespace, blob: Sealed | Uint8Array): Promise<Uint8Array>",
        summary: "Decrypts a blob. The header's namespace hash is compared with the one asked for before any decryption.",
        returns: "The plaintext bytes.",
        throws: ["SESSION_CLOSED", "NOT_SEALED", "SEAL_CORRUPT", "NAMESPACE_MISMATCH", "WRONG_PASSKEY"],
      },
      {
        name: "Satchel.unsealJson",
        anchor: a("Satchel.unsealJson"),
        kind: "method",
        signature: "unsealJson<T = unknown>(n: Namespace, blob: Sealed | Uint8Array): Promise<T>",
        summary: "unseal() followed by JSON.parse. A payload that is not JSON throws the platform SyntaxError, not a SatchelError.",
        returns: "The parsed value.",
        throws: ["SESSION_CLOSED", "NOT_SEALED", "SEAL_CORRUPT", "NAMESPACE_MISMATCH", "WRONG_PASSKEY"],
      },
      {
        name: "Satchel.fingerprint",
        anchor: a("Satchel.fingerprint"),
        kind: "method",
        signature: "fingerprint(n: Namespace): Promise<string>",
        summary: "Eight hex characters of SHA-256 over a fixed label and the namespace key. Safe to display, and equal on every device that holds the same passkey, which makes it the cross-device check.",
        returns: "For example 4cda9f4b.",
        throws: ["SESSION_CLOSED"],
      },
      {
        name: "Satchel.addPasskey",
        anchor: a("Satchel.addPasskey"),
        kind: "method",
        signature: "addPasskey(o: { appName: string }): Promise<void>",
        summary: "Creates a second passkey and wraps the root to it in the store, so either passkey opens every namespace. One more prompt.",
        throws: ["SESSION_CLOSED", "PRF_UNAVAILABLE", "RPID_MISMATCH", "PASSKEY_CANCELLED", "STORE_UNAVAILABLE"],
      },
      {
        name: "Satchel.grant",
        anchor: a("Satchel.grant"),
        kind: "method",
        signature: "grant(n: Namespace, to: GranteePublicKey, o: { label: string }): Promise<Grant>",
        summary: "Wraps the namespace's current epoch key to the grantee's public key with HPKE and records the grant in the registry. Resolves after the transaction has a successful receipt. The registry owner address pays gas.",
        returns: "The Grant, including the wrapped key and the transaction hash.",
        throws: ["SESSION_CLOSED", "INVALID_GRANTEE_KEY", "REGISTRY_UNREACHABLE"],
      },
      {
        name: "Satchel.revoke",
        anchor: a("Satchel.revoke"),
        kind: "method",
        signature: "revoke(n: Namespace, grantId: string): Promise<{ epoch: number; txHash: Hex }>",
        summary: "Deactivates the grant and moves the namespace to the next epoch. Records sealed from then on use a key the revoked app cannot derive. Resolves after a successful receipt.",
        returns: "The new epoch and the transaction hash.",
        throws: ["SESSION_CLOSED", "REGISTRY_UNREACHABLE"],
      },
      {
        name: "Satchel.close",
        anchor: a("Satchel.close"),
        kind: "method",
        signature: "close(): void",
        summary: "Zeroes the root in memory. Every later call throws SESSION_CLOSED.",
        throws: [],
      },
    ],
  },
  {
    title: "Sealed blobs",
    blurb: "Four plain header fields, then ciphertext: SAT1, version, namespace hash, epoch, IV.",
    entries: [
      {
        name: "Sealed",
        anchor: a("Sealed"),
        kind: "interface",
        signature: `interface Sealed {
  readonly v: 1;
  readonly nsHash: Hex;
  readonly epoch: number;
  toBytes(): Uint8Array;
}`,
        summary: "A sealed record. It carries its namespace hash and epoch in the clear so a mismatch is a named error before any decryption. The namespace path itself is never in the bytes.",
        params: [
          { name: "nsHash", type: "Hex", doc: "keccak256 of satchel/ns/ plus the path." },
          { name: "epoch", type: "number", doc: "The epoch key this record was sealed under." },
        ],
      },
      {
        name: "parseSealed",
        anchor: a("parseSealed"),
        kind: "function",
        signature: "function parseSealed(b: Uint8Array): Sealed",
        summary: "Reads the header of stored bytes without a key. Use it to route a blob to the right namespace or to show its epoch.",
        returns: "A Sealed.",
        throws: ["NOT_SEALED", "SEAL_CORRUPT"],
      },
    ],
  },
  {
    title: "Grants and readers",
    blurb: "The app on the other side of a grant holds its own key and never imports the passkey path.",
    entries: [
      {
        name: "GranteePublicKey",
        anchor: a("GranteePublicKey"),
        kind: "type",
        signature: "type GranteePublicKey = Hex",
        summary: "A P-256 public key, 65 bytes uncompressed, 0x-hex. Safe to send over any channel.",
      },
      {
        name: "createGrantee",
        anchor: a("createGrantee"),
        kind: "function",
        signature: `function createGrantee(keyPair?: CryptoKeyPair): Promise<{
  publicKey: GranteePublicKey;
  keyPair: CryptoKeyPair;
  reader(g: Grant): Reader;
}>`,
        summary: "Makes the reading app's identity. Pass keyPair to keep it across page loads: a non-extractable CryptoKeyPair can live in IndexedDB.",
        params: [{ name: "keyPair", type: "CryptoKeyPair", doc: "An ECDH P-256 pair from an earlier call. Omit to generate a fresh, non-extractable one." }],
        returns: "The public key to hand to the owner, the key pair to persist, and reader(g) to open records through a grant.",
        throws: [],
      },
      {
        name: "Grant",
        anchor: a("Grant"),
        kind: "interface",
        signature: `interface Grant {
  id: string;
  ns: Namespace;
  nsHash: Hex;
  epoch: number;
  granteeKeyHash: Hex;
  wrappedKey: Hex;
  label: string;
  txHash: Hex;
}`,
        summary: "What the owner hands the reader. Everything in it is also on chain in the registry's Granted event.",
        params: [
          { name: "wrappedKey", type: "Hex", doc: "HPKE (RFC 9180, DHKEM P-256, HKDF-SHA256, AES-128-GCM) seal of the epoch key to the grantee: 65 byte encapsulated key then 48 byte ciphertext." },
          { name: "epoch", type: "number", doc: "The one epoch this grant opens." },
        ],
      },
      {
        name: "Reader",
        anchor: a("Reader"),
        kind: "interface",
        signature: `interface Reader {
  unseal(blob: Sealed | Uint8Array): Promise<Uint8Array>;
  unsealJson<T = unknown>(blob: Sealed | Uint8Array): Promise<T>;
}`,
        summary: "Opens records through one grant. Obtained from createGrantee().reader(grant).",
      },
      {
        name: "Reader.unseal",
        anchor: a("Reader.unseal"),
        kind: "method",
        signature: "unseal(blob: Sealed | Uint8Array): Promise<Uint8Array>",
        summary: "Decrypts a record with the grant's epoch key. A record from a later epoch fails with GRANT_REVOKED; one from an earlier epoch with GRANT_EPOCH_OLDER.",
        returns: "The plaintext bytes.",
        throws: ["NOT_SEALED", "SEAL_CORRUPT", "NAMESPACE_MISMATCH", "GRANT_REVOKED", "GRANT_EPOCH_OLDER", "GRANT_NOT_FOR_KEY"],
      },
      {
        name: "Reader.unsealJson",
        anchor: a("Reader.unsealJson"),
        kind: "method",
        signature: "unsealJson<T = unknown>(blob: Sealed | Uint8Array): Promise<T>",
        summary: "unseal() followed by JSON.parse.",
        returns: "The parsed value.",
        throws: ["NOT_SEALED", "SEAL_CORRUPT", "NAMESPACE_MISMATCH", "GRANT_REVOKED", "GRANT_EPOCH_OLDER", "GRANT_NOT_FOR_KEY"],
      },
      {
        name: "Registry",
        anchor: a("Registry"),
        kind: "interface",
        signature: `interface Registry {
  address: Address;
  rpcUrl?: string;
  chain?: Chain;
}`,
        summary: "The epoch registry. Defaults to Monad testnet (chain 10143); pass chain and rpcUrl for any other EVM chain.",
      },
      {
        name: "Store",
        anchor: a("Store"),
        kind: "interface",
        signature: `interface Store {
  get(key: string): Promise<Uint8Array | undefined>;
  put(key: string, value: Uint8Array): Promise<void>;
}`,
        summary: "Holds ciphertext and public records only: wrapped roots for added passkeys. Never a key in the clear. The default is IndexedDB.",
      },
    ],
  },
  {
    title: "Errors",
    blurb: "Every failure carries a code, a fix and a docs path.",
    entries: [
      {
        name: "SatchelError",
        anchor: a("SatchelError"),
        kind: "class",
        signature: `class SatchelError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;
  readonly docs: string;
}`,
        summary: "The only error type the SDK throws for its own failures. message states the cause, fix states the next step, docs is the path of the matching entry in the error table.",
      },
      {
        name: "ErrorCode",
        anchor: a("ErrorCode"),
        kind: "type",
        signature: "type ErrorCode = \"PRF_UNAVAILABLE\" | \"PASSKEY_CANCELLED\" | ...",
        summary: "The closed set of codes. The table of every code with its cause and fix is generated from the SDK build.",
      },
    ],
  },
];

export const ENTRIES = SECTIONS.flatMap((s) => s.entries);
export const errorAnchor = (code: string) => `/reference/errors/#${code.toLowerCase().replaceAll("_", "-")}`;
