// node srcshot.mjs URL OUT.png [JS expression returning text to print]: open URL in the pinned scenes tab, print the expression's value, save a 2x screenshot.
import fs from "node:fs";
const [, , url, out, expr] = process.argv;
const port = process.env.CDP_PORT ?? "9396";
const base = `http://127.0.0.1:${port}`;
const pin = fs.readFileSync(`${process.env.HOME}/.cache/qa-tab-satchel-scenes`, "utf8").trim();
const tab = (await (await fetch(`${base}/json/list`)).json()).find((x) => x.id === pin);
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await fetch(`${base}/json/activate/${tab.id}`);
await send("Page.enable"); await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false });
await send("Page.navigate", { url }); await sleep(7000);
if (expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }); console.log(r.result?.result?.value); }
const shot = await send("Page.captureScreenshot", { format: "png" });
fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
await send("Emulation.clearDeviceMetricsOverride"); ws.close();
