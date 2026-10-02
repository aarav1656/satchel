import { SatchelError, type ErrorCode } from "@satchel/sdk";

/** What the demo shows a person for each SDK error: the cause in plain words and the next step. The developer-facing text stays in SatchelError. */
const PERSON: Partial<Record<ErrorCode, string>> = {
  PRF_UNAVAILABLE: "This passkey cannot protect your memory. Pick a passkey from iCloud Keychain, Google Password Manager, Windows Hello or a security key.",
  PASSKEY_CANCELLED: "The passkey prompt was closed. Nothing was sealed. Try again.",
  RPID_MISMATCH: "This address does not hold your vault. Open it at the address you created it on.",
  WRONG_PASSKEY: "That passkey did not create this vault.",
  NAMESPACE_MISMATCH: "That memory belongs to a different folder. Open it from memory/assistant.",
  SEAL_CORRUPT: "This memory failed its integrity check and was not opened.",
  GRANT_REVOKED: "Fern was revoked. It can still read what it saw before, and nothing sealed since.",
  GRANT_NOT_FOR_KEY: "This link was made for a different app.",
  REGISTRY_UNREACHABLE: "Monad did not answer or confirm in time. Retry in a moment.",
  OWNER_UNFUNDED: "Pip's registry address needs a little testnet MON before it can record this on Monad. Send some from the faucet, then try again. Nothing was sent.",
  NO_SECOND_PASSKEY: "Add a second passkey so losing this device does not lose your memory.",
};

export interface Failure {
  code: string;
  person: string;
  message: string;
  fix: string;
}

export function failure(e: unknown): Failure {
  if (e instanceof SatchelError) {
    return { code: e.code, person: PERSON[e.code] ?? e.message, message: e.message, fix: e.fix };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { code: "ERROR", person: message, message, fix: "" };
}
