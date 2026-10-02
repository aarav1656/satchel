export type ErrorCode =
  | "PRF_UNAVAILABLE"
  | "PASSKEY_CANCELLED"
  | "PASSKEY_NOT_FOUND"
  | "CHOOSE_PASSKEY_MODE"
  | "RPID_MISMATCH"
  | "WRONG_PASSKEY"
  | "NAMESPACE_MISMATCH"
  | "SEAL_CORRUPT"
  | "GRANT_REVOKED"
  | "GRANT_NOT_FOR_KEY"
  | "REGISTRY_UNREACHABLE"
  | "NO_SECOND_PASSKEY"
  | "INVALID_NAMESPACE"
  | "NOT_SEALED"
  | "SESSION_CLOSED"
  | "GRANT_EPOCH_OLDER"
  | "INVALID_GRANTEE_KEY"
  | "STORE_UNAVAILABLE"
  | "OWNER_UNFUNDED";

/** Every code with the fix a developer should apply. The reference page is generated from this table. */
export const FIXES: Record<ErrorCode, string> = {
  PRF_UNAVAILABLE:
    "use iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass or a YubiKey 5.",
  PASSKEY_CANCELLED: "call the same function again from a click handler and confirm the passkey prompt.",
  PASSKEY_NOT_FOUND:
    "offer both choices again: open() or openOrEnrol({ mode: \"open\" }) to pick another passkey, enrol() or openOrEnrol({ mode: \"enrol\" }) to create one. The passkey this device remembered is forgotten, so nothing blocks either choice.",
  CHOOSE_PASSKEY_MODE:
    "pass mode: \"enrol\" to create a passkey or mode: \"open\" to use one the person already has, each from its own click handler. openOrEnrol() runs one passkey prompt per call and never chains both.",
  RPID_MISMATCH: "pin rpId to the hostname the passkey was created under, usually your production hostname.",
  WRONG_PASSKEY: "open with the passkey that sealed this data, or use a second passkey added with addPasskey().",
  NAMESPACE_MISMATCH: "unseal with the namespace the blob was sealed under.",
  SEAL_CORRUPT: "re-fetch the blob from where it was stored; this copy is truncated or altered.",
  GRANT_REVOKED:
    "ask the owner to call regrant() for your public key: a grant covers one epoch only, and revoking any reader of a namespace moves every reader to the next epoch.",
  GRANT_NOT_FOR_KEY: "ask the owner to grant to this app's public key from createGrantee().",
  REGISTRY_UNREACHABLE:
    "check the registry address and RPC, then retry. Call epochOf(registry, session.registryOwner, nsHashOf(ns)) first to see whether the earlier call landed.",
  NO_SECOND_PASSKEY: "call addPasskey() while the original passkey is available.",
  INVALID_NAMESPACE: "use lowercase letters and digits joined by / or -, 3 to 64 characters, e.g. memory/assistant.",
  NOT_SEALED: "pass bytes produced by seal().toBytes().",
  SESSION_CLOSED: "call open() again.",
  GRANT_EPOCH_OLDER: "use the grant issued for the epoch this blob was sealed at.",
  INVALID_GRANTEE_KEY: "pass the publicKey returned by createGrantee().",
  STORE_UNAVAILABLE: "pass a store in OpenOptions; this runtime has no IndexedDB.",
  OWNER_UNFUNDED: "send the native token (testnet MON from https://faucet.monad.xyz on Monad testnet) to session.registryOwner, then call grant() or revoke() again.",
};

export class SatchelError extends Error {
  readonly code: ErrorCode;
  readonly fix: string;
  readonly docs: string;
  constructor(code: ErrorCode, message: string, options?: { fix?: string; cause?: unknown }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SatchelError";
    this.code = code;
    this.fix = options?.fix ?? FIXES[code];
    this.docs = `/reference/errors#${code.toLowerCase().replaceAll("_", "-")}`;
  }
}

export const isSatchelError = (e: unknown): e is SatchelError => e instanceof SatchelError;
