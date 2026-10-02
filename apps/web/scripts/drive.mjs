// drive.mjs URL STEPS.mjs OUTDIR : runs scripted steps in ONE pinned deepsurge tab (PIN_FILE), never opens a second tab.
// Adapted from ~/.claude/scratch/cdp-tab.mjs. VAUTH=1 adds a virtual platform authenticator with PRF so passkey flows run headless.
// Steps: {navigate} {eval} {poll, timeout} {assert} {tclick: "button text"} (real Input.dispatchMouseEvent) {vauth: "reset"} {click: "button text"} (synthetic element.click()) {click_sel: css} {set_text: {sel, text}} {wait_file} {wait: ms} {shot}
// A failed poll, assert or click exits 1: a step that cannot find its element is a failure, not a skip.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [, , url, stepsFile, out] = process.argv;
const port = process.env.CDP_PORT ?? execFileSync("bhn", ["deepsurge", "status"], { encoding: "utf8", timeout: 8000 }).match(/\s(\d{4,5})\s+RUNNING/)[1];
const base = `http://127.0.0.1:${port}`;
const pinFile = process.env.PIN_FILE;
if (!pinFile) throw new Error("set PIN_FILE to your own pinned tab file, e.g. ~/.cache/qa-tab-satchel");
const pages = (await (await fetch(`${base}/json/list`)).json()).filter((t) => t.type === "page");
const pinned = fs.existsSync(pinFile) ? fs.readFileSync(pinFile, "utf8").trim() : "";
let tab = pages.find((t) => t.id === pinned);
if (!tab) {
  tab = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
  fs.writeFileSync(pinFile, tab.id);
}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend[d.id]) {
    pend[d.id](d);
    delete pend[d.id];
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return `EXCEPTION ${r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text}`;
  return r.result?.result?.value;
};
// A server-rendered button exists before React attaches its handler; a click in that gap does nothing. Wait for hydration.
const HYDRATED = `(()=>{const b=[...document.querySelectorAll('main button, .demo button, .doc-main button')];return document.readyState==='complete'&&(b.length===0||b.some(x=>Object.keys(x).some(k=>k.startsWith('__reactProps'))))})()`;
const hydrate = async () => { for (let i = 0; i < 40 && !(await ev(HYDRATED)); i++) await sleep(500); };
let vauthId;
const addVauth = async () => (await send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } })).result.authenticatorId;
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const log = (o) => console.error("STEP " + JSON.stringify(o));
let failed = false;
const vars = {};
// {eval, save: "x"} keeps a value in the driver; __VAR_x__ in a later eval, poll or assert expression becomes its JSON.
const sub = (expr) => expr.replace(/__VAR_(\w+)__/g, (_, n) => JSON.stringify(vars[n] ?? null));
const fail = (o) => { log({ ...o, FAIL: true }); failed = true; };
try {
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900), deviceScaleFactor: 1, mobile: Number(process.env.W ?? 1440) < 600 });
  await send("Page.enable");
  if (process.env.VAUTH === "1") {
    await send("Page.bringToFront");
    await send("WebAuthn.enable", { enableUI: false });
    vauthId = await addVauth();
  }
  await send("Page.navigate", { url });
  await sleep(3000);
  await hydrate();
  const steps = (await import(new URL(stepsFile, `file://${process.cwd()}/`).href)).default;
  for (const s of steps) {
    if (s.wait) await sleep(s.wait);
    if (s.navigate) {
      const to = s.navigate.startsWith("$") ? vars[s.navigate.slice(1)] : s.navigate;
      if (s.fresh) { await send("Page.navigate", { url: "about:blank" }); await sleep(800); }
      await send("Page.navigate", { url: to });
      await sleep(s.settle ?? 2000);
      await hydrate();
      log({ navigate: to });
    }
    if (s.wait_file) {
      for (let i = 0; i < 180 && !fs.existsSync(s.wait_file); i++) await sleep(1000);
      if (!fs.existsSync(s.wait_file)) { fail({ wait_file: s.wait_file }); break; }
      log({ wait_file: s.wait_file });
    }
    if (s.eval) {
      const v = await ev(sub(s.eval));
      if (s.save) vars[s.save] = v;
      log({ eval: s.label ?? s.eval.slice(0, 50), value: v });
    }
    if (s.poll) {
      const until = Date.now() + (s.timeout ?? 20000);
      let v;
      while (Date.now() < until) {
        v = await ev(sub(s.poll));
        if (v && !(typeof v === "string" && v.startsWith("EXCEPTION"))) break;
        await sleep(500);
      }
      if (!v || (typeof v === "string" && v.startsWith("EXCEPTION"))) { fail({ poll: s.label ?? s.poll.slice(0, 80), value: v }); break; }
      log({ poll: s.label ?? s.poll.slice(0, 50), value: v });
    }
    if (s.assert) {
      const v = await ev(sub(s.assert));
      if (!v || (typeof v === "string" && v.startsWith("EXCEPTION"))) { fail({ assert: s.label ?? s.assert.slice(0, 80), value: v }); break; }
      log({ assert: s.label ?? s.assert.slice(0, 50), ok: true, value: typeof v === "string" ? v : undefined });
    }
    if (s.vauth === "reset") {
      // A fresh virtual authenticator: every credential the previous one held is gone, as for a passkey deleted or made elsewhere.
      await send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: vauthId });
      vauthId = await addVauth();
      log({ vauth: "reset", authenticatorId: vauthId });
    }
    if (s.tclick) {
      // Trusted click: real Input.dispatchMouseEvent at the button's centre, so the page gets genuine user activation.
      await send("Page.bringToFront");
      await sleep(300);
      const c = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(s.tclick)}));if(!b)return null;b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
      if (!c || typeof c === "string") { fail({ tclick: s.tclick, ok: false }); break; }
      await mouse("mouseMoved", c[0], c[1]);
      await mouse("mousePressed", c[0], c[1]);
      await mouse("mouseReleased", c[0], c[1]);
      log({ tclick: s.tclick, ok: true, at: c.map(Math.round) });
    }
    if (s.click || s.click_sel || s.set_text) {
      if (process.env.VAUTH === "1") { await send("Page.bringToFront"); await sleep(300); }
    }
    if (s.click) {
      const ok = await ev(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(s.click)}));if(!b)return false;b.click();return true})()`);
      if (!ok) { fail({ click: s.click, ok }); break; }
      log({ click: s.click, ok });
    }
    if (s.click_sel) {
      const ok = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(s.click_sel)});if(!b)return false;b.click();return true})()`);
      if (!ok) { fail({ click_sel: s.click_sel, ok }); break; }
      log({ click_sel: s.click_sel, ok });
    }
    if (s.set_text) {
      const ok = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(s.set_text.sel)});if(!el)return false;const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set;set.call(el,${JSON.stringify(s.set_text.text)});el.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
      if (!ok) { fail({ set_text: s.set_text.sel, ok }); break; }
      log({ set_text: s.set_text.text, ok });
    }
    if (s.shot) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(`${out}/${s.shot}.png`, Buffer.from(r.result.data, "base64"));
      log({ shot: s.shot });
    }
    await sleep(500);
  }
} finally {
  ws.close();
}
process.exit(failed ? 1 : 0);
