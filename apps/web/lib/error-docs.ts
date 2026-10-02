import { SatchelError, type ErrorCode } from "satchel-sdk";
import { ENTRIES } from "./reference";

/** One authored cause per ErrorCode. Record<ErrorCode, ...> makes a code added to the SDK without a cause here a type error. */
const CAUSES: Record<ErrorCode, string> = {
  PRF_UNAVAILABLE:
    "The authenticator returned no 32 byte PRF output, so there is nothing to derive keys from. Some password managers and security keys do not implement the WebAuthn PRF extension.",
  PASSKEY_CANCELLED:
    "The passkey prompt was closed or timed out. open() and enrol() raise it because WebAuthn gives the page the same answer for a closed prompt and for a device with no matching passkey; openOrEnrol() turns that answer into PASSKEY_NOT_FOUND whenever it was opening, and raises this only for a closed create prompt.",
  PASSKEY_NOT_FOUND:
    "openOrEnrol() was opening a passkey and none was chosen: the prompt was closed, or the passkey this device remembered was deleted, lives on another device, or belonged to an authenticator that is gone. When a remembered passkey fails, openOrEnrol() deletes that memory first, so the next call is a first visit and nothing is stuck. WebAuthn cannot tell a closed prompt from a missing passkey, so both end here. Nothing was created.",
  CHOOSE_PASSKEY_MODE:
    "openOrEnrol() found no remembered passkey and was given no mode of \"open\" or \"enrol\". It stops before any prompt, because a first visit that tried to open and then create would chain two WebAuthn ceremonies from one click, which browsers can refuse and which can duplicate a passkey.",
  RPID_MISMATCH:
    "The page origin is not the rpId the passkey was created under, for example a preview URL. A passkey works only under its own rpId.",
  WRONG_PASSKEY:
    "The passkey's output derives a different key than the one that sealed the data, or the stored wrap for an added passkey failed authentication.",
  NAMESPACE_MISMATCH:
    "The blob header's namespace hash differs from the namespace you asked for, or a grant fetched with fetchGrant() covers a different namespace hash than the one named. Raised before any decryption.",
  SEAL_CORRUPT:
    "The blob is shorter than its header plus one GCM tag, or its ciphertext failed authentication under a grant's key. It was altered or truncated and nothing was decrypted.",
  GRANT_REVOKED:
    "A reader's grant covers one epoch and the record is from a later one. The owner moved the namespace on: revoking any reader's grant moves the namespace to the next epoch for every reader, so the revoked app stays locked out and every other reader needs regrant() before it can open new records.",
  GRANT_NOT_FOR_KEY:
    "The grant was wrapped to a different grantee key, or could not be opened with this app's key.",
  REGISTRY_UNREACHABLE:
    "A registry read or write did not answer, did not confirm within 30 seconds, or reverted. Also raised when no registry is configured on the session, and by fetchGrant() when the hash it was given has no receipt, reverted, or has no Granted event from that registry.",
  NO_SECOND_PASSKEY:
    "Recovery was requested but the chosen passkey was never added to this vault with addPasskey(), or no store is available to look it up.",
  INVALID_NAMESPACE: "The path is not 3 to 64 lowercase letters and digits joined by / or -.",
  NOT_SEALED:
    "The bytes are not a satchel blob: the SAT1 header is missing, the version is unsupported, or the epoch field is impossible.",
  SESSION_CLOSED: "close() zeroed this session's root. Any later call throws.",
  GRANT_EPOCH_OLDER:
    "The record is from an epoch earlier than the grant covers. A grant cannot derive keys for epochs other than its own.",
  INVALID_GRANTEE_KEY: "The grantee key is not hex, is not 65 bytes in uncompressed form, or is not a point on P-256.",
  STORE_UNAVAILABLE:
    "No store was passed and this runtime has no IndexedDB, or the store refused a read or write for an added passkey or for the passkey marker openOrEnrol keeps.",
  OWNER_UNFUNDED:
    "The registry owner address, derived from the passkey, cannot pay for the transaction. grant, regrant and revoke read its balance and the gas estimate first and stop before sending, so nothing was spent and no state changed. The message names the address and the shortfall; the fix names where to send it.",
};

export interface ErrorRow {
  code: ErrorCode;
  anchor: string;
  cause: string;
  fix: string;
  docs: string;
  /** Names of the reference entries whose Throws line lists this code. The only source of the "Raised by" column and the "Thrown by" line. */
  thrownBy: { name: string; anchor: string }[];
}

/** The one source the summary table and the detail rows are both rendered from. */
export function errorRows(): ErrorRow[] {
  return (Object.keys(CAUSES) as ErrorCode[]).map((code) => {
    const e = new SatchelError(code, "");
    return {
      code,
      anchor: e.docs.split("#")[1] ?? "",
      cause: CAUSES[code],
      fix: e.fix,
      docs: e.docs,
      thrownBy: ENTRIES.filter((x) => x.throws?.includes(code)).map((x) => ({ name: x.name, anchor: x.anchor })),
    };
  });
}

export const ERROR_CODES = Object.keys(CAUSES) as ErrorCode[];
