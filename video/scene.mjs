// node scene.mjs SCENE CUES_JSON OUT.(mp4|png)   or   node scene.mjs --batch JOBS.json  (jobs: [{scene, cues, out}])
// Renders scenes/SCENE.html at 1920x1080 in one pinned deepsurge tab. A scene is a pure function of t (window.render(t)).
// png: one transparent still at CUES.t. mp4: CUES.dur seconds at 30 fps. Callers hold the shared recording lock (the tab must be in front to paint).
import fs from "node:fs";
import { spawn, execFileSync } from "node:child_process";

const port = process.env.CDP_PORT ?? execFileSync("bhn", ["deepsurge", "status"], { encoding: "utf8", timeout: 30000 }).match(/\s(\d{4,5})\s+RUNNING/)[1];
const base = `http://127.0.0.1:${port}`;
const pinFile = process.env.PIN_FILE_SCENES ?? `${process.env.HOME}/.cache/qa-tab-satchel-scenes`;
const pages = (await (await fetch(`${base}/json/list`)).json()).filter((t) => t.type === "page");
const pinned = fs.existsSync(pinFile) ? fs.readFileSync(pinFile, "utf8").trim() : "";
let tab = pages.find((t) => t.id === pinned);
if (!tab) { tab = await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json(); fs.writeFileSync(pinFile, tab.id); }
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}, ms = 0) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); if (ms) setTimeout(() => { if (pend[i]) { delete pend[i]; r({ timeout: true }); } }, ms); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const abs = (p) => (typeof p === "string" && p.startsWith("/") ? "file://" + p : p);

async function one(scene, cues, out) {
  for (const k of ["img", "logo"]) if (cues[k]) cues[k] = abs(cues[k]);
  const isPng = out.endsWith(".png");
  await send("Emulation.setDefaultBackgroundColorOverride", isPng ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
  const url = `file://${new URL("./scenes/" + scene + ".html", import.meta.url).pathname}#${encodeURIComponent(JSON.stringify(cues))}`;
  await send("Page.navigate", { url }); await sleep(500);
  await send("Page.reload");
  for (let i = 0; i < 100; i++) { if (await ev("window.__ready===true")) break; await sleep(120); }
  if (!(await ev("window.__ready===true"))) throw new Error("scene did not become ready: " + scene);
  const shot = async (t, fmt) => {
    await ev(`window.render(${t})`);
    for (let k = 0; k < 8; k++) {
      const r = await send("Page.captureScreenshot", { format: fmt, ...(fmt === "jpeg" ? { quality: 94 } : {}), fromSurface: true }, 10000);
      if (r.result?.data) return Buffer.from(r.result.data, "base64");
      console.error("screenshot stalled, bringing the tab to front (try " + (k + 1) + ")");
      await fetch(`${base}/json/activate/${tab.id}`); await send("Page.bringToFront", {}, 3000);
    }
    throw new Error("screenshot never returned");
  };
  if (isPng) fs.writeFileSync(out, await shot(cues.t ?? 99, "png"));
  else {
    const fps = 30, n = Math.round((cues.dur ?? 10) * fps);
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", out], { stdio: ["pipe", "inherit", "inherit"] });
    for (let i = 0; i < n; i++) { const b = await shot(i / fps, "jpeg"); if (!ff.stdin.write(b)) await new Promise((r) => ff.stdin.once("drain", r)); }
    ff.stdin.end(); await new Promise((r) => ff.on("close", r));
  }
  console.log(out);
}
try {
  await fetch(`${base}/json/activate/${tab.id}`);
  await send("Page.enable"); await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  if (process.argv[2] === "--batch") for (const j of JSON.parse(fs.readFileSync(process.argv[3], "utf8"))) await one(j.scene, j.cues, j.out);
  else await one(process.argv[2], JSON.parse(process.argv[3]), process.argv[4]);
} finally {
  await send("Emulation.setDefaultBackgroundColorOverride", {}).catch(() => {});
  ws.close();
}
