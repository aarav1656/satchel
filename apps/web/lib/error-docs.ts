import type { ErrorCode } from "@satchel/sdk";

/** One authored entry per ErrorCode. Record<ErrorCode, ...> makes a code added to the SDK without an entry here a type error. */
export const ERROR_DOCS: Record<ErrorCode, { cause: string; where: string }> = {
  PRF_UNAVAILABLE: {
    cause: "The authenticator returned no 32 byte PRF output, so there is nothing to derive keys from. Some password managers and security keys do not implement the WebAuthn PRF extension.",
    where: "open, enrol, addPasskey, fromPrfOutput",
  },
  PASSKEY_CANCELLED: {
    cause: "The passkey prompt was closed, timed out, or no passkey on this device matched.",
    where: "open, enrol, addPasskey",
  },
  RPID_MISMATCH: {
    cause: "The page origin is not the rpId the passkey was created under, for example a preview URL. A passkey works only under its own rpId.",
    where: "open, enrol, addPasskey",
  },
  WRONG_PASSKEY: {
    cause: "The passkey's output derives a different key than the one that sealed the data, or the stored wrap for an added passkey failed authentication.",
    where: "open, unseal, unsealJson",
  },
  NAMESPACE_MISMATCH: {
    cause: "The blob header's namespace hash differs from the namespace you asked for. Raised before any decryption.",
    where: "unseal, unsealJson, Reader.unseal",
  },
  SEAL_CORRUPT: {
    cause: "The blob is shorter than its header plus one GCM tag, or its ciphertext failed authentication under a grant's key. It was altered or truncated and nothing was decrypted.",
    where: "parseSealed, unseal, Reader.unseal",
  },
  GRANT_REVOKED: {
    cause: "A reader's grant covers one epoch and the record is from a later one: the owner rotated the namespace after the grant.",
    where: "Reader.unseal",
  },
  GRANT_NOT_FOR_KEY: {
    cause: "The grant was wrapped to a different grantee key, or could not be opened with this app's key.",
    where: "reader, Reader.unseal",
  },
  REGISTRY_UNREACHABLE: {
    cause: "A registry read or write did not answer, did not confirm within 30 seconds, reverted, or no registry is configured on the session.",
    where: "seal, grant, revoke",
  },
  NO_SECOND_PASSKEY: {
    cause: "Recovery was requested but the chosen passkey was never added to this vault with addPasskey(), or no store is available to look it up.",
    where: "open",
  },
  INVALID_NAMESPACE: {
    cause: "The path is not 3 to 64 lowercase letters and digits joined by / or -.",
    where: "ns",
  },
  NOT_SEALED: {
    cause: "The bytes are not a satchel blob: the SAT1 header is missing, the version is unsupported, or the epoch field is impossible.",
    where: "parseSealed, unseal, Reader.unseal",
  },
  SESSION_CLOSED: {
    cause: "close() zeroed this session's root. Any later call throws.",
    where: "every Satchel method",
  },
  GRANT_EPOCH_OLDER: {
    cause: "The record is from an epoch earlier than the grant covers. A grant cannot derive keys for epochs other than its own.",
    where: "Reader.unseal",
  },
  INVALID_GRANTEE_KEY: {
    cause: "The grantee key is not hex, is not 65 bytes in uncompressed form, or is not a point on P-256.",
    where: "grant",
  },
  STORE_UNAVAILABLE: {
    cause: "No store was passed and this runtime has no IndexedDB, or the store refused a read or write for an added passkey.",
    where: "open, addPasskey",
  },
};
