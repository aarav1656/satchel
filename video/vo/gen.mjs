// gen.mjs NAME : voice every sentence of NAME.json with voiceb (2 in flight), level to -19 LUFS, write out-NAME/{id}.wav and out-NAME/timings.json.
import fs from "node:fs";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
const name = process.argv[2], only = process.argv.slice(3);
const lines = JSON.parse(fs.readFileSync(`${name}.json`, "utf8"));
const out = `out-${name}`; fs.mkdirSync(out, { recursive: true });
const q = lines.filter((l) => !only.length || only.includes(l.id));
let i = 0;
async function worker() {
  while (i < q.length) {
    const l = q[i++];
    const raw = `${out}/${l.id}.raw.wav`, fin = `${out}/${l.id}.wav`;
    for (let a = 0; a < 80; a++) {
      try {
        const r = await run("voiceb", ["say", l.text, "-o", raw, "-v", "b59aa555"], { timeout: 240000 });
        const heard = (r.stdout.match(/heard: (.*)/) ?? [])[1] ?? "";
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-19:TP=-1.5:LRA=7", "-ar", "48000", "-ac", "1", fin]);
        const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", fin], { encoding: "utf8" }));
        l.dur = d; l.heard = heard;
        console.log(l.id, d.toFixed(2), "|", heard);
        break;
      } catch (e) { console.log(l.id, "attempt", a + 1, "failed:", String(e.stdout ?? e.message).slice(-200)); await new Promise((r) => setTimeout(r, 9000)); if (a === 79) l.fail = true; }
    }
  }
}
await worker(); // one in flight: the voice server shares a single GPU worker with every other lane (429 when saturated)
const prev = fs.existsSync(`${out}/timings.json`) ? JSON.parse(fs.readFileSync(`${out}/timings.json`, "utf8")) : [];
const merged = lines.map((l) => q.includes(l) ? l : prev.find((p) => p.id === l.id) ?? l);
fs.writeFileSync(`${out}/timings.json`, JSON.stringify(merged, null, 1));
