// narr.mjs NAME : lay the per-sentence clips of NAME.json end to end (gap after each sentence, default 0.3 s, or the sentence's own "gap"),
// write out-NAME/narration.wav (48 kHz mono) and out-NAME/timeline.json: [{id, text, start, end}].
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const name = process.argv[2];
const lines = JSON.parse(fs.readFileSync(`${name}.json`, "utf8"));
const dir = `out-${name}`;
const lead = Number(process.env.LEAD ?? 0.2);
let t = lead;
const tl = [];
const inputs = [];
for (const l of lines) {
  const f = `${dir}/${l.id}.wav`;
  if (!fs.existsSync(f)) throw new Error("missing " + f);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
  tl.push({ id: l.id, text: l.text, cap: l.cap ?? l.text, start: +t.toFixed(3), end: +(t + dur).toFixed(3) });
  inputs.push({ f, start: t });
  t += dur + (l.gap ?? 0.3);
}
const total = t;
const args = ["-y", "-loglevel", "error"];
inputs.forEach((i) => args.push("-i", i.f));
const chain = inputs.map((i, k) => `[${k}:a]adelay=${Math.round(i.start * 1000)}|${Math.round(i.start * 1000)}[a${k}]`).join(";");
const mix = inputs.map((_, k) => `[a${k}]`).join("") + `amix=inputs=${inputs.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[m]`;
args.push("-filter_complex", chain + ";" + mix, "-map", "[m]", "-ar", "48000", "-ac", "1", `${dir}/narration.wav`);
execFileSync("ffmpeg", args, { stdio: "inherit" });
fs.writeFileSync(`${dir}/timeline.json`, JSON.stringify({ total: +total.toFixed(3), lines: tl }, null, 1));
console.log(JSON.stringify({ total: +total.toFixed(2), sentences: tl.length }));
