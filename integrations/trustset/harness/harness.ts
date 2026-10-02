// Drives trustset's web/src/lib/sealed.ts (imported as @sealed) through a real WebAuthn PRF ceremony against a local
// SealedNotes contract. The pre-patch module (legacy-sealed.ts, from main) creates the old-format note in the same run.
import { ethers } from "ethers";
import { createPasskeyWithPrfOutput } from "@category-labs/mera";
import { NOTES_ABI, explainSeal, openNote, readNotes, sealNote } from "@sealed";
import { openNote as legacyOpenNote, readNotes as legacyReadNotes, sealNote as legacySealNote } from "./legacy-sealed";

const out = document.getElementById("out") as HTMLPreElement;
const prompts = { create: 0, get: 0 };
const creds = navigator.credentials;
const create = creds.create.bind(creds);
const get = creds.get.bind(creds);
creds.create = (o) => (prompts.create++, create(o));
creds.get = (o) => (prompts.get++, get(o));

const line = (tag: string, text: string) => { out.textContent += `${tag} ${text}\n`; };
const counts = () => `prompts create=${prompts.create} get=${prompts.get}`;
const root = (e: unknown): string => { const c = (e as { cause?: unknown }).cause; return c ? root(c) : `${(e as Error).name}: ${(e as Error).message}`; };
const code = (e: unknown) => (e as { code?: string }).code ?? "none";
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");

const cfg = await (await fetch("./config.json")).json() as { rpc: string; notes: string; agentId: string; ownerKey: string };
const p = new ethers.JsonRpcProvider(cfg.rpc);
const signer = new ethers.NonceManager(new ethers.Wallet(cfg.ownerKey, p));
const id = BigInt(cfg.agentId);
const conn = { cfg: { notes: cfg.notes }, p } as never;
const TEXTS = ["N1 runbook: restart order is db, api, keeper", "N2 runbook: rotate the cold key after any stop", "N3 stop reason: price feed diverged from the TWAP"];
const OLD = "OLD runbook sealed by the unpatched module: page the on-call before unpausing";
let mark = -1;
const gets = () => prompts.get + prompts.create;

async function rows() {
  const raw = await new ethers.Contract(cfg.notes, NOTES_ABI, p).notesOf(id) as { vault: string }[];
  return raw.map((r) => { const b = ethers.getBytes(r.vault); return { len: b.length, head: new TextDecoder().decode(b.subarray(0, 4)).replace(/[^\x20-\x7e]/g, "?") }; });
}

async function withFocusRetry(run: () => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); } catch (e) {
      if (!/does not have focus/.test(root(e)) || attempt === 15) throw e;
      line("RETRY", `page lacked focus (attempt ${attempt}), asking again`);
      window.focus();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const steps: Record<string, () => Promise<void>> = {
  async passkey() {
    const made = await createPasskeyWithPrfOutput({ rp: { id: location.hostname, name: "trustset harness" }, user: { name: "owner", displayName: "owner" } });
    made.prfOutput.fill(0);
    line("PASSKEY", `created credential=${made.credentialId} rpId=${location.hostname} (setup, not part of the notes session) ${counts()}`);
  },
  async old() {
    const before = gets();
    await legacySealNote(conn, signer, id, "runbook", OLD);
    const r = (await rows()).at(-1)!;
    line("OLDNOTE", `sealed by main:web/src/lib/sealed.ts, stored ${r.len} B, first 4 bytes "${r.head}", prompts_for_this_seal=${gets() - before} ${counts()}`);
  },
  async seal3() {
    mark = gets();
    const t = performance.now();
    for (const [i, text] of TEXTS.entries()) await sealNote(conn, signer, id, i === 2 ? "stop" : "runbook", text);
    const r = (await rows()).slice(-3);
    line("SEAL3", `sealed 3 notes in ${Math.round(performance.now() - t)} ms, stored ${r.map((x) => `${x.len} B "${x.head}"`).join(", ")}, prompts_since_seal3_start=${gets() - mark} ${counts()}`);
  },
  async open3() {
    if (mark < 0) mark = gets();
    const notes = await readNotes(conn, id);
    const sat = notes.filter((n) => n.vault && "satchel" in n.vault);
    line("READ", `readNotes returned ${notes.length} notes: ${notes.map((n) => (n.vault ? ("satchel" in n.vault ? "satchel" : "mera-json") : "unreadable")).join(", ")}`);
    const got: string[] = [];
    for (const n of sat) got.push(await openNote(n.vault!));
    const ok = got.length === 3 && got.every((g, i) => g === TEXTS[i]);
    line("OPEN3", `opened ${got.length} satchel notes, all match=${ok}, prompts_since_session_start=${gets() - mark} ${counts()}`);
  },
  async openold() {
    const before = gets();
    const n = (await readNotes(conn, id)).find((x) => x.vault && !("satchel" in x.vault));
    if (!n) throw new Error("no mera-json note on chain");
    const text = await openNote(n.vault!);
    line("OPENOLD", `old-format note opened by patched openNote, match=${text === OLD}, prompts_for_this_open=${gets() - before} ${counts()}`);
  },
  async legacy3() {
    mark = gets();
    for (const [i, text] of TEXTS.entries()) await legacySealNote(conn, signer, id, i === 2 ? "stop" : "runbook", text);
    const sealed = gets() - mark;
    const got: string[] = [];
    for (const n of await legacyReadNotes(conn, id)) got.push(await legacyOpenNote(n.vault!));
    const r = (await rows()).slice(-3);
    line("LEGACY3", `unpatched module: sealed 3 notes (${r.map((x) => `${x.len} B "${x.head}"`).join(", ")}) prompts=${sealed}, then opened ${got.length} notes, all match=${got.every((g, i) => g === TEXTS[i])}, prompts_since_session_start=${gets() - mark} ${counts()}`);
    await sealNote(conn, signer, id, "runbook", "N4 sealed by the patched module");
    const view = (await legacyReadNotes(conn, id)).map((n) => (n.vault ? "readable" : "unreadable"));
    line("FWDCOMPAT", `an unpatched page reading a chain that now holds a satchel note sees: ${view.join(", ")}`);
  },
  async negsat() {
    const n = (await readNotes(conn, id)).find((x) => x.vault && "satchel" in x.vault)!;
    const before = gets();
    try { await openNote(n.vault!); line("NEGSAT", "NO_THROW (check failed to fail)"); }
    catch (e) { line("NEGSAT", `code=${code(e)} explainSeal="${explainSeal(e)}" prompts_for_this_try=${gets() - before} ${counts()}`); }
  },
  async negold() {
    const n = (await readNotes(conn, id)).find((x) => x.vault && !("satchel" in x.vault))!;
    const before = gets();
    try { await openNote(n.vault!); line("NEGOLD", "NO_THROW (check failed to fail)"); }
    catch (e) { line("NEGOLD", `code=${code(e)} explainSeal="${explainSeal(e)}" prompts_for_this_try=${gets() - before} ${counts()}`); }
  },
};
for (const name of Object.keys(steps)) {
  const b = document.createElement("button");
  b.id = name; b.textContent = name;
  b.onclick = () => withFocusRetry(steps[name]!).catch((e) => line("ERROR", `step=${name} code=${code(e)} ${root(e).slice(0, 300)}`));
  document.getElementById("buttons")!.append(b);
}
line("READY", `origin=${location.origin} variant=${new URLSearchParams(location.search).get("b") ?? "patched"} notes_on_chain=${(await rows()).length}`);
