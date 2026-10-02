export type ErrorCode =
  | "PRF_UNAVAILABLE"
  | "PASSKEY_CANCELLED"
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
  | "STORE_UNAVAILABLE";

/** Every code with the fix a developer should apply. The reference page is generated from this table. */
export const FIXES: Record<ErrorCode, string> = {
  PRF_UNAVAILABLE:
    "use iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass or a YubiKey 5.",
  PASSKEY_CANCELLED: "call open() again from a click handler and confirm the prompt.",
  RPID_MISMATCH: "pin rpId to the hostname the passkey was created under, usually your production hostname.",
  WRONG_PASSKEY: "open with the passkey that sealed this data, or use a second passkey added with addPasskey().",
  NAMESPACE_MISMATCH: "unseal with the namespace the blob was sealed under.",
  SEAL_CORRUPT: "re-fetch the blob from where it was stored; this copy is truncated or altered.",
  GRANT_REVOKED: "ask the owner to grant again; a grant covers one epoch only.",
  GRANT_NOT_FOR_KEY: "ask the owner to grant to this app's public key from createGrantee().",
  REGISTRY_UNREACHABLE: "check the registry address and RPC, then retry. Read epochOf() first to see whether the earlier call landed.",
  NO_SECOND_PASSKEY: "call addPasskey() while the original passkey is available.",
  INVALID_NAMESPACE: "use lowercase letters and digits joined by / or -, 3 to 64 characters, e.g. memory/assistant.",
  NOT_SEALED: "pass bytes produced by seal().toBytes().",
  SESSION_CLOSED: "call open() again.",
  GRANT_EPOCH_OLDER: "use the grant issued for the epoch this blob was sealed at.",
  INVALID_GRANTEE_KEY: "pass the publicKey returned by createGrantee().",
  STORE_UNAVAILABLE: "pass a store in OpenOptions; this runtime has no IndexedDB.",
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
