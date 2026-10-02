import { createGrantee, enrol, ns, open, SatchelError, type Satchel } from "../packages/sdk/dist/index.js";
import deployment from "../deployments/testnet.json";

const KNOWN = "satchel rig plaintext: pip prefers metric units";
const STORED = "rig.sealed";
const out = document.getElementById("out") as HTMLPreElement;
const prompts = { create: 0, get: 0 };
const registry = { address: deployment.address as `0x${string}` }; // default chain: Monad testnet 10143

// count WebAuthn ceremonies (one per browser prompt) without touching the SDK
const creds = navigator.credentials;
const create = creds.create.bind(creds);
const get = creds.get.bind(creds);
creds.create = (o) => (prompts.create++, create(o));
creds.get = (o) => (prompts.get++, get(o));

let session: Satchel | undefined;
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
const line = (tag: string, text: string) => {
  out.textContent += `${tag} ${text}\n`;
};
const counts = () => `prompts create=${prompts.create} get=${prompts.get} total=${prompts.create + prompts.get}`;
const root = (e: unknown): string => {
  const c = (e as { cause?: unknown }).cause;
  return c ? root(c) : `${(e as Error).name}: ${(e as Error).message}`;
};
const fail = (e: unknown) =>
  line("ERROR", e instanceof SatchelError ? `code=${e.code} message=${e.message} fix=${e.fix} cause=${root(e)}` : `non-satchel ${(e as Error).name}: ${(e as Error).message}`);
const need = () => {
  if (!session) throw new Error("no session: click Enrol or Open first");
  return session;
};

// A shared browser can lose window focus between clicks and WebAuthn then refuses the call before any prompt.
// Retrying that one refusal is the same as the user clicking again; every retry is printed.
async function withFocusRetry(run: () => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (!/does not have focus/.test(root(e)) || attempt === 15) throw e;
      line("RETRY", `page lacked focus (attempt ${attempt}), asking again`);
      window.focus();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const steps: Record<string, () => Promise<void>> = {
  async enrol() {
    session = await enrol({ rpId: location.hostname, appName: "Satchel rig", registry });
    line("ENROL", `credential=${session.credential?.credentialId} rpId=${location.hostname} ${counts()}`);
    line("FP", `ns=memory/assistant fp=${await session.fingerprint(ns("memory/assistant"))}`);
    line("OWNER", `address=${session.registryOwner}`);
  },
  async seal() {
    const blob = (await need().seal(ns("memory/assistant"), KNOWN)).toBytes();
    localStorage.setItem(STORED, hex(blob));
    line("SEALED", `ns=memory/assistant epoch=1 ${blob.length} B hex=${hex(blob)}`);
    line("FP", `ns=memory/assistant fp=${await need().fingerprint(ns("memory/assistant"))} ${counts()}`);
  },
  async open() {
    session = await open({ rpId: location.hostname, registry });
    line("OPEN", `credential=${session.credential?.credentialId} ${counts()}`);
    line("FP", `ns=memory/assistant fp=${await session.fingerprint(ns("memory/assistant"))}`);
    line("OWNER", `address=${session.registryOwner}`);
  },
  async unseal() {
    const stored = localStorage.getItem(STORED);
    if (!stored) throw new Error("no stored blob");
    const text = new TextDecoder().decode(await need().unseal(ns("memory/assistant"), unhex(stored)));
    line("UNSEALED", `ns=memory/assistant plaintext=${JSON.stringify(text)} match=${text === KNOWN} ${counts()}`);
  },
  async second() {
    const before = prompts.create + prompts.get;
    const n2 = ns("memory/notes");
    const blob = await need().seal(n2, { note: "second namespace" });
    const back = await need().unsealJson<{ note: string }>(n2, blob);
    line("SECOND", `ns=memory/notes epoch=${blob.epoch} fp=${await need().fingerprint(n2)} roundtrip=${JSON.stringify(back)} extra_prompts=${prompts.create + prompts.get - before} ${counts()}`);
  },
  async live() {
    const s = need();
    const n = ns("memory/assistant");
    const text = (u: Uint8Array) => new TextDecoder().decode(u);
    const fern = await createGrantee();
    const g = await s.grant(n, fern.publicKey, { label: "Fern" });
    line("GRANT", `id=${g.id} epoch=${g.epoch} tx=${g.txHash} nsHash=${g.nsHash} owner=${s.registryOwner}`);
    const before = await s.seal(n, "sealed before revoke");
    line("LIVE", `before epoch=${before.epoch} fern_reads=${JSON.stringify(text(await fern.reader(g).unseal(before)))}`);
    const r = await s.revoke(n, g.id);
    line("REVOKE", `id=${g.id} newEpoch=${r.epoch} tx=${r.txHash}`);
    const after = await s.seal(n, "sealed after revoke");
    const fernNew = await fern.reader(g).unseal(after).then(() => "NO_THROW", (e) => (e instanceof SatchelError ? e.code : String(e)));
    line("LIVE", `after epoch=${after.epoch} fern_on_new=${fernNew} fern_on_old=${JSON.stringify(text(await fern.reader(g).unseal(before)))} owner_reads_new=${JSON.stringify(text(await s.unseal(n, after)))}`);
  },
};

for (const [name, run] of Object.entries(steps)) {
  const b = document.createElement("button");
  b.id = name;
  b.textContent = { enrol: "Enrol passkey", seal: "Seal known plaintext", open: "Open passkey", unseal: "Unseal stored blob", second: "Second namespace", live: "Grant, seal, revoke on Monad" }[name]!;
  b.onclick = () => withFocusRetry(run).catch(fail);
  document.getElementById("buttons")!.append(b);
}
line("READY", `origin=${location.origin} stored_blob=${localStorage.getItem(STORED) ? "yes" : "no"}`);
