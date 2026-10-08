// Drives Firsthand's packages/sdk/src/webauthn/satchel.ts (imported as @fh/satchel) through a real WebAuthn PRF
// ceremony against a virtual authenticator, next to Firsthand's own WebAuthnPrfSource and KeyTree, unmodified.
// Nothing here prints a key or a PRF output: only public values (principal commitment, deposit address) and
// one-way fingerprints. No chain, no transactions.
import { getPasskeyPrfOutput } from "@fh/mera";
import { sha256 } from "@fh/core";
import { KeyTree, PRF_OUTPUT_LENGTH } from "@fh/crypto";
import { nsHashOf, open as satchelOpen, type Satchel } from "@fh/satchel-sdk";
import { firsthandNs, MeraPrfSource, openWithSatchel } from "@fh/satchel";
import { registerPasskey, WebAuthnPrfSource } from "@fh/prf";

const out = document.getElementById("out") as HTMLPreElement;
const prompts = { get: 0, create: 0, getAttempts: 0, createAttempts: 0 };
const creds = navigator.credentials;
const nget = creds.get.bind(creds);
const ncreate = creds.create.bind(creds);
creds.get = async (o) => { prompts.getAttempts++; const r = await nget(o); prompts.get++; return r; };
creds.create = async (o) => { prompts.createAttempts++; const r = await ncreate(o); prompts.create++; return r; };

const line = (tag: string, text: string) => { out.textContent += `${tag} ${text}\n`; };
const counts = () => `prompts get=${prompts.get} create=${prompts.create}`;
const root = (e: unknown): string => { const c = (e as { cause?: unknown }).cause; return c ? root(c) : `${(e as Error).name}: ${(e as Error).message}`; };
const code = (e: unknown) => (e as { code?: string }).code ?? "none";
const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h: string) => Uint8Array.from(h.match(/.{2}/g) ?? [], (b) => Number.parseInt(b, 16));
const rpId = location.hostname;
const store = localStorage;
const gets = () => prompts.get;

type Fp = { principal: string; deposit_0_e1: string; vault_0_e1: string; vault_1_e7: string; nonce_1_e7: string };
const digest = (label: string, k: Uint8Array) => hex(sha256(new Uint8Array([...new TextEncoder().encode(label), ...k]))).slice(0, 16);

// Public values and one-way fingerprints of four locker keys, read through the tree's own accessors.
function fingerprint(tree: KeyTree): Fp {
  const a = tree.authorityKey();
  const principal = a.commitment;
  a.scalar.dispose();
  const d = tree.depositKey(0, 1n);
  const deposit = d.address;
  d.privateKey.dispose();
  const v0 = tree.vaultKey(0, 1n);
  const v1 = tree.vaultKey(1, 7n);
  const n1 = tree.nonceKey(1, 7n);
  const fp = {
    principal,
    deposit_0_e1: deposit,
    vault_0_e1: v0.use((k) => digest("fh-proof/vault", k)),
    vault_1_e7: v1.use((k) => digest("fh-proof/vault", k)),
    nonce_1_e7: n1.use((k) => digest("fh-proof/nonce", k)),
  };
  v0.dispose(); v1.dispose(); n1.dispose();
  return fp;
}
const show = (_fp: Fp) => "principal=[redacted] deposit=[redacted] k_ns(0,1)=[redacted] k_ns(1,7)=[redacted] k_nonce(1,7)=[redacted]";
const same = (a: Fp, b: Fp) => (Object.keys(a) as (keyof Fp)[]).every((k) => a[k] === b[k]);
const diffKeys = (a: Fp, b: Fp) => (Object.keys(a) as (keyof Fp)[]).filter((k) => a[k] !== b[k]).length;

const cred = (slot: "A" | "B") => unhex(store.getItem(`fh.cred${slot}`) ?? "");
const legacy = async (slot: "A" | "B") => KeyTree.fromSource(new WebAuthnPrfSource({ rpId, credentialId: cred(slot) }));
const legacyFp = async (slot: "A" | "B") => { const t = await legacy(slot); const f = fingerprint(t); t.dispose(); return f; };
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const NS0 = firsthandNs(0);
const NS1 = firsthandNs(1);
const TEXT = "captures namespace record: sealed under firsthand/ns/0";
let mark = -1;

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

async function sealChecks(s: Satchel, tag: string) {
  const a = await s.seal(NS0, TEXT);
  const b = await s.seal(NS0, { n: 2, note: "second record, same namespace" });
  const c = await s.seal(NS1, "imports namespace record: sealed under firsthand/ns/1");
  const dec = (u: Uint8Array) => new TextDecoder().decode(u);
  const okA = dec(await s.unseal(NS0, a)) === TEXT;
  const okB = ((await s.unsealJson(NS0, b)) as { n: number }).n === 2;
  const okC = dec(await s.unseal(NS1, c)).startsWith("imports namespace record");
  line(tag, `sealed 3 blobs (${a.toBytes().length} B, ${b.toBytes().length} B, ${c.toBytes().length} B), opened all 3 in their own namespace: ${okA && okB && okC}, ${counts()}`);
  let cross = "NO_THROW (check failed to fail)";
  try { await s.unseal(NS1, a); } catch (e) { cross = `code=${code(e)}`; }
  const forged = a.toBytes();
  forged.set(unhex(nsHashOf(NS1).slice(2)), 5);
  let forgedRes = "NO_THROW (check failed to fail)";
  try { await s.unseal(NS1, forged); } catch (e) { forgedRes = `code=${code(e)}`; }
  line(`${tag}-NS`, `blob of firsthand/ns/0 opened as firsthand/ns/1: ${cross}; same blob with its header relabelled to ns/1: ${forgedRes}; ${counts()}`);
  store.setItem("fh.blob0", hex(a.toBytes()));
  return a;
}

async function enrolSlot(slot: "A" | "B") {
  const made = await registerPasskey({ rpId, rpName: "Firsthand harness", userId: crypto.getRandomValues(new Uint8Array(16)), userName: `holder-${slot}` });
  store.setItem(`fh.cred${slot}`, hex(made.credentialId));
  line("PASSKEY", `${slot}: created through Firsthand registerPasskey, prfEnabled=${made.prfEnabled} rpId=${rpId} (setup, not part of any session) ${counts()}`);
}

const steps: Record<string, () => Promise<void>> = {
  async passkeyA() { await enrolSlot("A"); },
  async passkeyB() { await enrolSlot("B"); },
  async legacy() {
    const before = gets();
    const tree = await legacy("A");
    const fp = fingerprint(tree);
    tree.dispose();
    store.setItem("fh.legacyFp", JSON.stringify(fp));
    line("LEGACY", `KeyTree.fromSource(WebAuthnPrfSource), Firsthand as it is: ${show(fp)} prompts_for_this_unlock=${gets() - before} ${counts()}`);
  },
  async naive() {
    const before = gets();
    const tree = await legacy("A");
    const s = await satchelOpen({ rpId, credential: { credentialId: b64u(cred("A")) } });
    const fp = fingerprint(tree);
    const f = await s.fingerprint(NS0);
    line("NAIVE", `locker unlock then satchel-sdk open() beside it: locker ${show(fp)}; satchel fingerprint(firsthand/ns/0)=[redacted]; prompts_for_this_unlock=${gets() - before} ${counts()}`);
    tree.dispose(); s.close();
  },
  async adapter() {
    const before = gets();
    mark = gets();
    const sess = await openWithSatchel(new WebAuthnPrfSource({ rpId, credentialId: cred("A") }), { rpId });
    const fp = fingerprint(sess.keys);
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    line("ADAPTER", `openWithSatchel(WebAuthnPrfSource): ${show(fp)} prompts_for_this_unlock=${gets() - before} ${counts()}`);
    line("EQUAL", `adapter tree vs Firsthand's own tree, same passkey: all ${Object.keys(fp).length} fields equal=${same(fp, old)} differing_fields=${diffKeys(fp, old)}`);
    const sf = await sess.satchel.fingerprint(NS0);
    store.setItem("fh.satchelFp", sf);
    const owner = sess.satchel.registryOwner.toLowerCase();
    let clash = false;
    for (let i = 0; i < 16; i++) { const d = sess.keys.depositKey(i, 1n); clash ||= d.address.toLowerCase() === owner; d.privateKey.dispose(); }
    line("SATCHEL", `fingerprint(firsthand/ns/0)=[redacted] registryOwner=[redacted] equals_a_locker_deposit_address=${clash}`);
    await sealChecks(sess.satchel, "SEALED");
    line("SESSION", `prompts_since_session_start=${gets() - mark} (unlock, 3 seals, 3 opens, 2 refused opens) ${counts()}`);
    sess.dispose();
  },
  async mera() {
    const before = gets();
    const sess = await openWithSatchel(new MeraPrfSource({ rpId, credentialId: cred("A") }), { rpId });
    const fp = fingerprint(sess.keys);
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    const sf = await sess.satchel.fingerprint(NS0);
    line("MERA", `openWithSatchel(MeraPrfSource, Firsthand's salt): ${show(fp)} prompts_for_this_unlock=${gets() - before} ${counts()}`);
    line("EQUAL", `mera-ceremony tree vs Firsthand's own tree, same passkey: equal=${same(fp, old)} differing_fields=${diffKeys(fp, old)}; satchel fingerprint equals the WebAuthnPrfSource session's: ${sf === store.getItem("fh.satchelFp")}`);
    sess.dispose();
  },
  async control() {
    const before = gets();
    const { prfOutput } = await getPasskeyPrfOutput({ rpId, credential: { credentialId: b64u(cred("A")) } });
    if (prfOutput.length !== PRF_OUTPUT_LENGTH) throw new Error("bad prf length");
    const tree = KeyTree.fromPrf(prfOutput);
    const fp = fingerprint(tree);
    tree.dispose();
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    line("CONTROL", `Mera with its own default salt: ${show(fp)} prompts_for_this_unlock=${gets() - before}`);
    line("EQUAL", `default-salt tree vs Firsthand's own tree, same passkey: equal=${same(fp, old)} differing_fields=${diffKeys(fp, old)} (a different salt must give different keys, so the equality check can fail)`);
  },
  async mutant() {
    const sess = await openWithSatchel(new WebAuthnPrfSource({ rpId, credentialId: cred("A") }), { rpId });
    const fp = fingerprint(sess.keys);
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    line("MUTANT", `adapter with its key tree built from the satchel root: ${show(fp)}`);
    line("EQUAL", `mutant tree vs Firsthand's own tree: equal=${same(fp, old)} differing_fields=${diffKeys(fp, old)}`);
    sess.dispose();
  },
  async reopenA() {
    mark = gets();
    const before = gets();
    const sess = await openWithSatchel(new WebAuthnPrfSource({ rpId, credentialId: cred("A") }), { rpId });
    const fp = fingerprint(sess.keys);
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    const blob = unhex(store.getItem("fh.blob0") ?? "");
    const text = new TextDecoder().decode(await sess.satchel.unseal(NS0, blob));
    line("REOPEN-A", `fresh page load, same passkey: tree equals the earlier legacy tree=${same(fp, old)}; blob sealed before the reload opens=${text === TEXT}; satchel fingerprint unchanged=${(await sess.satchel.fingerprint(NS0)) === store.getItem("fh.satchelFp")}; prompts_for_this_unlock=${gets() - before} ${counts()}`);
    sess.dispose();
  },
  async reopenB() {
    const before = gets();
    const sess = await openWithSatchel(new WebAuthnPrfSource({ rpId, credentialId: cred("B") }), { rpId });
    const fp = fingerprint(sess.keys);
    const old = JSON.parse(store.getItem("fh.legacyFp") ?? "null") as Fp;
    let res = "NO_THROW (check failed to fail)";
    try { await sess.satchel.unseal(NS0, unhex(store.getItem("fh.blob0") ?? "")); } catch (e) { res = `code=${code(e)}`; }
    line("REOPEN-B", `a second passkey: tree equals passkey A's tree=${same(fp, old)} (differing_fields=${diffKeys(fp, old)}); opening A's blob: ${res}; prompts_for_this_unlock=${gets() - before} ${counts()}`);
    sess.dispose();
  },
};

for (const name of Object.keys(steps)) {
  const b = document.createElement("button");
  b.id = name; b.textContent = name;
  b.onclick = () => withFocusRetry(steps[name]!).catch((e) => line("ERROR", `step=${name} code=${code(e)} ${root(e).slice(0, 300)}`));
  document.getElementById("buttons")!.append(b);
}
line("READY", `origin=${location.origin} variant=${new URLSearchParams(location.search).get("b") ?? "adapter"} credentials_known=${["A", "B"].filter((s) => store.getItem(`fh.cred${s}`)).join("") || "none"} ${counts()}`);
