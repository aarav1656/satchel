"use client";

import { isHex } from "viem";

/** ciphertext and public are what satchel writes. other is a value satchel did not write (the browser, an extension, another app on this host). flagged is key-like data in the clear or an unrecognised satchel record. */
export type Verdict = "ciphertext" | "public" | "other" | "flagged";
export interface ScanRow {
  area: "localStorage" | "sessionStorage" | "indexedDB" | "cookie";
  key: string;
  bytes: number;
  verdict: Verdict;
  reason: string;
}

const SAT1 = "0x53415431";
const bytesOf = (s: string) => new TextEncoder().encode(s).length;
/** Hex of 16 or more bytes, or base64 of 16 or more bytes: the shape a key takes when it is written down. */
const KEY_LIKE = /^(?:(?:0x)?[0-9a-fA-F]{32,}|[A-Za-z0-9+/_-]{22,}={0,2})$/;
const leaves = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(leaves) : v && typeof v === "object" ? Object.values(v).flatMap(leaves) : [];
const keyLike = (v: unknown) => leaves(v).some((l) => KEY_LIKE.test(l.trim()) && !isSealedHex(l));
const isSealedHex = (v: unknown) => typeof v === "string" && isHex(v) && v.toLowerCase().startsWith(SAT1);

/** Keys this site writes, with the shape their value must have to count as public or ciphertext. Anything else is flagged. */
export function classifyWebStorage(area: ScanRow["area"], key: string, value: string): ScanRow {
  const row = (verdict: Verdict, reason: string): ScanRow => ({ area, key, bytes: bytesOf(key) + bytesOf(value), verdict, reason });
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }
  if (isSealedHex(parsed)) return row("ciphertext", "SAT1 sealed record");
  if (key === "satchel.pip.memories" && Array.isArray(parsed)) {
    return parsed.length > 0 && parsed.every((m) => isSealedHex((m as { hex?: unknown })?.hex))
      ? row("ciphertext", `${parsed.length} sealed records, every one starts with the SAT1 header`)
      : row("flagged", "a memory entry is not a sealed record");
  }
  if ((key === "satchel.pip.credential" || key === "satchel.quickstart.credential") && typeof parsed === "object" && parsed !== null) {
    const keys = Object.keys(parsed);
    return keys.every((k) => k === "credentialId" || k === "transports")
      ? row("public", "public credential id")
      : row("flagged", `unexpected fields: ${keys.join(", ")}`);
  }
  if (key === "satchel.pip.owner" && typeof parsed === "string" && /^0x[0-9a-fA-F]{40}$/.test(parsed)) return row("public", "registry address, also on chain");
  if (key === "satchel.demo.grants" && Array.isArray(parsed)) {
    const allowed = new Set(["id", "ns", "nsHash", "epoch", "granteeKeyHash", "wrappedKey", "label", "txHash"]);
    const ok = parsed.every((g) => {
      const grant = (g as { grant?: Record<string, unknown> })?.grant;
      return grant !== undefined && Object.keys(grant).every((k) => allowed.has(k));
    });
    return ok ? row("public", `${parsed.length} grants, every field is also in the registry's Granted event`) : row("flagged", "a grant record has a field the registry event does not");
  }
  if (key.startsWith("satchel.")) return row("flagged", "a satchel key holding a value of an unknown shape");
  return keyLike(parsed) ? row("flagged", "looks like key material in the clear") : row("other", "not written by satchel: the browser, an extension or another app on this host");
}

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** What an IndexedDB value must look like to count as ciphertext or public. `path` is db/store/key, `k` the key alone. */
export function classifyIdb(path: string, k: string, v: unknown): ScanRow {
  const mk = (verdict: Verdict, reason: string, bytes: number): ScanRow => ({ area: "indexedDB", key: path, bytes, verdict, reason });
  if (v instanceof ArrayBuffer) {
    if (k.startsWith("satchel/wrap/")) return mk("ciphertext", "root wrapped under a second passkey (AES-GCM)", v.byteLength);
    if (k.startsWith("satchel/known/")) {
      let marker: unknown;
      try {
        marker = JSON.parse(new TextDecoder().decode(v));
      } catch {
        return mk("flagged", "an unreadable value under a satchel/known key", v.byteLength);
      }
      const fields = marker && typeof marker === "object" ? Object.keys(marker) : ["?"];
      return fields.every((f) => f === "credentialId" || f === "transports")
        ? mk("public", "the public credential id openOrEnrol remembers for this rpId", v.byteLength)
        : mk("flagged", `unexpected fields in the passkey marker: ${fields.join(", ")}`, v.byteLength);
    }
    return mk("flagged", "raw bytes in the clear under an unknown key", v.byteLength);
  }
  if (v && typeof v === "object" && "privateKey" in v && "publicKey" in v) {
    const pair = v as CryptoKeyPair;
    return pair.privateKey.extractable === false
      ? mk("public", "non-extractable CryptoKey: the browser holds it and scripts cannot read it", 0)
      : mk("flagged", "private key is extractable", 0);
  }
  if (path === "fern/kv/grants" && Array.isArray(v)) {
    return v.every((h) => typeof h === "string" && TX_HASH.test(h))
      ? mk("public", `${v.length} grant transaction hashes, each also on chain`, v.length * 66)
      : mk("flagged", "a grants entry is not a transaction hash", 0);
  }
  return keyLike(v) ? mk("flagged", "looks like key material in the clear", 0) : mk("other", "not written by satchel", 0);
}

async function idbRows(): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  const dbs = (await indexedDB.databases?.()) ?? [];
  for (const info of dbs) {
    if (!info.name) continue;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(info.name as string);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const storeName of Array.from(db.objectStoreNames)) {
      const store = db.transaction(storeName).objectStore(storeName);
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const r = store.getAllKeys();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      for (const k of keys) {
        const v = await new Promise<unknown>((resolve, reject) => {
          const r = db.transaction(storeName).objectStore(storeName).get(k);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
        rows.push(classifyIdb(`${info.name}/${storeName}/${String(k)}`, String(k), v));
      }
    }
    db.close();
  }
  return rows;
}

export async function scanBrowser(): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  for (const [area, store] of [["localStorage", localStorage], ["sessionStorage", sessionStorage]] as const) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null) rows.push(classifyWebStorage(area, key, store.getItem(key) ?? ""));
    }
  }
  rows.push(...(await idbRows()));
  for (const c of document.cookie.split("; ").filter(Boolean)) {
    const [name = c, ...rest] = c.split("=");
    const value = rest.join("=");
    rows.push(
      keyLike(value)
        ? { area: "cookie", key: name, bytes: bytesOf(c), verdict: "flagged", reason: "looks like key material in the clear" }
        : { area: "cookie", key: name, bytes: bytesOf(c), verdict: "other", reason: "satchel sets no cookies; this one belongs to the browser or another app on this host" },
    );
  }
  return rows;
}
