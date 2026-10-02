// Copy of ~/.claude/scratch/cdp-tab.mjs with one change: with VAUTH=1 the tab is brought to the front before every click,
// because WebAuthn refuses a page without browser focus and other agents share this browser.
// cdp-tab.mjs URL STEPS.json OUTDIR : run scripted steps in ONE reused deepsurge QA tab (id kept in .qa-tab).
// Never opens a second tab: the pinned tab is navigated each run and left open for the next.
// Steps: {eval: "js"} | {file: {selector, path}} | {goto_file: "/path/with/url"} | {click: "text prefix"} | {drag: {from:[x,y], to:[x,y]}} | {key: "ArrowUp"} | {shot: "name"} | {wait: ms}
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [, , url, stepsFile, out] = process.argv;
const port = process.env.CDP_PORT ?? execFileSync("bhn", ["deepsurge", "status"], { encoding: "utf8", timeout: 8000 }).match(/\s(\d{4,5})\s+RUNNING/)[1];
const base = `http://127.0.0.1:${port}`;
const pinFile = process.env.PIN_FILE ?? new URL("./.qa-tab", import.meta.url);
const pages = (await (await fetch(`${base}/json/list`)).json()).filter((t) => t.type === "page");
const pinned = fs.existsSync(pinFile) ? fs.readFileSync(pinFile, "utf8").trim() : "";
let tab = pages.find((t) => t.id === pinned);
if (!tab) {
  tab = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json();
  fs.writeFileSync(pinFile, tab.id);
}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
try {
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: Number(process.env.W ?? 1440), height: Number(process.env.H ?? 900), deviceScaleFactor: 1, mobile: Number(process.env.W ?? 1440) < 600 });
  await send("Emulation.setTouchEmulationEnabled", { enabled: process.env.TOUCH === "1", maxTouchPoints: process.env.TOUCH === "1" ? 5 : 0 });
  await send("Page.enable");
  // VAUTH=1: a virtual platform authenticator with PRF, so passkey (Mera) flows run without a human.
  if (process.env.VAUTH === "1") {
    await send("Page.bringToFront"); // WebAuthn refuses a background tab; emulated focus is not enough
    await send("WebAuthn.enable", { enableUI: false });
    await send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } });
  }
  if (process.env.PRELOAD) await send("Page.addScriptToEvaluateOnNewDocument", { source: process.env.PRELOAD });
  await send("Page.navigate", { url });
  await sleep(8000);
  const log = [];
  for (const s of JSON.parse(fs.readFileSync(stepsFile, "utf8"))) {
    if (s.wait) await sleep(s.wait);
    if (s.goto_file) {
      // Wait for another process to write the next URL, then navigate this same tab (keeps the virtual authenticator).
      for (let i = 0; i < 120 && !fs.existsSync(s.goto_file); i++) await sleep(2000);
      const next = fs.readFileSync(s.goto_file, "utf8").trim();
      await send("Page.navigate", { url: next });
      log.push({ goto: next.slice(0, 80) });
    }
    if (s.file) {
      // {file: {selector, path}}: hand a local file to an <input type=file>, as a user picking it would.
      const doc = await send("DOM.getDocument", { depth: -1, pierce: true });
      const q = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: s.file.selector });
      const r = await send("DOM.setFileInputFiles", { files: [s.file.path], nodeId: q.result?.nodeId });
      log.push({ file: s.file.path, ok: !r.error, error: r.error?.message });
    }
    if (s.eval) log.push({ eval: s.eval.slice(0, 60), value: await ev(s.eval) });
    if (s.click && process.env.VAUTH === "1") { await send("Page.bringToFront"); await sleep(400); }
    if (s.click) log.push({ click: s.click, ok: await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().startsWith(${JSON.stringify(s.click)}));if(!b)return false;b.click();return true})()`) });
    if (s.drag) {
      const [[x1, y1], [x2, y2]] = [s.drag.from, s.drag.to];
      await mouse("mouseMoved", x1, y1); await mouse("mousePressed", x1, y1);
      for (let k = 1; k <= 10; k++) { await mouse("mouseMoved", x1 + ((x2 - x1) * k) / 10, y1 + ((y2 - y1) * k) / 10); await sleep(30); }
      await mouse("mouseReleased", x2, y2);
      log.push({ drag: s.drag });
    }
    if (s.drag_hover) { const [x, y] = s.drag_hover; await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 }); const c = await ev(`(()=>{const e=document.elementFromPoint(,);let n=e;while(n&&!(n.style&&n.style.cursor))n=n.parentElement;return n?n.style.cursor:""})()`); if (c) log.push({ y, cursor: c }); continue; }
    if (s.type) { await send("Input.insertText", { text: s.type }); log.push({ type: s.type }); }
    if (s.key) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: s.key, code: s.key }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: s.key, code: s.key }); log.push({ key: s.key }); }
    if (s.shot) { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`${out}/${s.shot}.png`, Buffer.from(r.result.data, "base64")); log.push({ shot: s.shot }); }
    console.error("STEP " + JSON.stringify(log[log.length - 1] ?? null));
    await sleep(600);
  }
  console.log(JSON.stringify(log, null, 1));
} finally {
  ws.close();
}
