// Drives Curb's web/src/lib/passkey/keys.ts (imported as @keys) through a real WebAuthn PRF ceremony. @cross is the other
// implementation (main's keys.ts for the patched bundle, the patch for the legacy bundle), so one passkey is read by both.
// No key is printed and nothing is sent: only addresses and the number of navigator.credentials calls.
import * as keys from "@keys";
import * as cross from "@cross";

const out = document.getElementById("out") as HTMLPreElement;
const variant = new URLSearchParams(location.search).get("b") ?? "patched";
const load = new URLSearchParams(location.search).get("load") ?? "1";
const prompts = { create: 0, get: 0 };
const creds = navigator.credentials;
const create = creds.create.bind(creds);
const get = creds.get.bind(creds);
creds.create = (o) => (prompts.create++, create(o));
creds.get = (o) => (prompts.get++, get(o));

const line = (text: string) => { out.textContent += `${text}\n`; };
const root = (e: unknown): string => { const c = (e as { cause?: unknown }).cause; return c ? root(c) : `${(e as Error).name}: ${(e as Error).message}`; };
const REC = "harness.record";
const rec = () => JSON.parse(localStorage.getItem(REC) ?? "null");
const host = location.hostname;

async function measure(action: string, which: string, run: () => Promise<Record<string, unknown>>) {
  const before = { ...prompts };
  const t = performance.now();
  const r = await run();
  const d = { create: prompts.create - before.create, get: prompts.get - before.get };
  line("RESULT " + JSON.stringify({ variant, load, action, impl: which, prompts: d.create + d.get, create: d.create, get: d.get, ms: Math.round(performance.now() - t), ...r }));
}

type Mod = typeof keys;
const addrs = (r: { owner: string; trading: string }) => ({ owner: r.owner, trading: r.trading });
const mk = (m: Mod, which: string) => ({
  create: () => measure("create", which, async () => { const r = await m.createAccount(host); localStorage.setItem(REC, JSON.stringify(r)); return addrs(r); }),
  signin: () => measure("signin", which, async () => addrs(await m.signIn(host))),
  owner: () => measure("owner", which, async () => {
    const r = rec(); // withOwnerKey throws if the passkey's owner address is not the one on the record
    return { owner: await m.withOwnerKey(host, r, async (a) => a.address), matchesRecord: true };
  }),
  trading: () => measure("trading", which, async () => {
    const s = await m.openTradingSession(host, rec());
    const a = s.address; s.end();
    return { trading: a, matchesRecord: true };
  }),
});
const mine = mk(keys, variant);
const other = mk(cross, variant === "legacy" ? "patched" : "legacy");
const actions: Record<string, () => Promise<void>> = {
  create: mine.create, signin: mine.signin, owner: mine.owner, trading: mine.trading,
  xsignin: other.signin, xowner: other.owner, xtrading: other.trading,
};

async function withFocusRetry(run: () => Promise<void>) {
  for (let attempt = 1; ; attempt++) {
    try { return await run(); } catch (e) {
      if (!/does not have focus|document is not focused/.test(root(e)) || attempt === 15) throw e;
      line(`RETRY page lacked focus (attempt ${attempt})`);
      window.focus();
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
for (const [name, fn] of Object.entries(actions)) {
  const b = document.createElement("button");
  b.id = name; b.textContent = name;
  b.onclick = () => withFocusRetry(fn).catch((e) => line(`ERROR ${name} ${root(e).slice(0, 300)}`));
  document.getElementById("buttons")!.append(b);
}
line(`READY origin=${location.origin} variant=${variant} load=${load}`);
