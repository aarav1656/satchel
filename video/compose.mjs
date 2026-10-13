// node compose.mjs SPEC.json : cut recorded clips and rendered scenes onto the narration timeline.
// spec = { out, timeline, audio, work, labels?:{boxName:text}, beats:[{ name, ids:[sentence ids], pieces:[...], overlays?, caption? }] }
// piece = { clip, ss, se, speed?, fit?, zoom?:{z,fx,fy}, marks?, only? } | { scene, cues, fit? } (a scene mp4 rendered by scene.mjs, cached by cue hash)
// A beat runs from its first sentence's start to the next beat's first sentence start (first from 0, last to the end of the narration).
// Pieces with fit:true share what is left of the beat after fixed pieces; their speed is length / share (warned when outside 0.6 to 3.2).
// Overlays (callout boxes taken from marks.json, burned-in sentence captions, extra stills) are transparent PNGs rendered by scene.mjs, faded in ffmpeg.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const specPath = path.resolve(process.argv[2]);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const root = path.dirname(specPath);
const R = (p) => path.resolve(root, p);
const work = R(spec.work ?? "work/compose");
fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(R("work/ov"), { recursive: true }); fs.mkdirSync(R("work/sc"), { recursive: true });
const FPS = 30, LEAD = spec.lead ?? 0.12;
const KZ = spec.clipScale ?? 0.86, FW = Math.round(1920 * KZ / 2) * 2, FH = Math.round(1080 * KZ / 2) * 2, FX = Math.round((1920 - FW) / 2);
const PRE = process.argv[3] === "--pre"; // pass 1: only work out which scene clips are needed and render them in one browser session
const run = (cmd, args) => { if (!PRE) execFileSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"] }); };
const ff = (args) => run("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const probe = (f) => PRE ? 1 : Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }));
const tl = JSON.parse(fs.readFileSync(R(spec.timeline), "utf8"));
const byId = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
const lockRun = (args) => { for (let i = 0; i < 40; i++) { try { execFileSync("lockf", ["-t", "0", "/tmp/deepsurge-rec.lock", ...args], { stdio: ["ignore", "inherit", "inherit"] }); return; } catch (e) { if (e.status !== 75) throw e; execFileSync("sleep", ["15"]); } } throw new Error("the recording lock stayed busy"); };
const lock = (args) => { if (!PRE) lockRun(args); };
const hash = (o) => crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);

let jobs = [];
function still(scene, cues) {
  const f = R(`work/ov/${scene}-${hash(cues)}.png`);
  if (!fs.existsSync(f) && !jobs.some((j) => j.out === f)) jobs.push({ scene, cues: { ...cues, t: 99 }, out: f });
  return f;
}
function flush() {
  if (PRE || !jobs.length) return;
  const py = jobs.filter((j) => j.scene === "caption" || j.scene === "box"), br = jobs.filter((j) => !py.includes(j)); jobs = [];
  if (py.length) { const jf = R("work/ov/jobs-py.json"); fs.writeFileSync(jf, JSON.stringify(py)); run("/tmp/ftvenv/bin/python", [R("ovl.py"), jf]); }
  if (br.length) { const jf = R("work/ov/jobs.json"); fs.writeFileSync(jf, JSON.stringify(br)); lock(["node", R("scene.mjs"), "--batch", jf]); }
}
const sjobs = [];
function sceneClip(scene, cues, dur) {
  const d = +dur.toFixed(2) + 0.3;
  const f = R(`work/sc/${scene}-${hash([cues, d])}.mp4`);
  if (!fs.existsSync(f) && !sjobs.some((j) => j.out === f)) sjobs.push({ scene, cues: { ...cues, dur: d }, out: f });
  return f;
}

const starts = spec.beats.map((b, i) => (i === 0 ? 0 : byId[b.ids[0]].start - LEAD));
const warns = [], files = [];
spec.beats.forEach((b, bi) => {
  const t0 = starts[bi], t1 = bi + 1 < spec.beats.length ? starts[bi + 1] : tl.total;
  const d = +(t1 - t0).toFixed(3);
  const fixed = b.pieces.filter((p) => p.clip && !p.fit).reduce((s, p) => s + (p.se - p.ss) / (p.speed ?? 1), 0) + b.pieces.filter((p) => p.hold).reduce((s, p) => s + p.hold, 0);
  const fits = b.pieces.filter((p) => p.fit);
  const left = Math.max(0.5, d - fixed);
  const share = (p) => (p.share ? p.share : left / fits.length);
  const pieceFiles = [], boxes = []; let off = 0;
  b.pieces.forEach((p, pi) => {
    const f = path.join(work, `b${bi}p${pi}.mp4`);
    if (p.still) {
      const len = p.fit ? share(p) : p.hold;
      const png = path.join(work, `still-${hash([p.still, p.at])}.png`);
      if (!fs.existsSync(png)) ff(["-ss", String(p.at), "-i", R(p.still), "-frames:v", "1", png]);
      const z = p.push ?? { z: 1.05, fx: 0.5, fy: 0.5 }; const n = Math.round(len * FPS);
      ff(["-loop", "1", "-framerate", String(FPS), "-t", len.toFixed(3), "-i", png, "-vf", `scale=${FW * 2}:${FH * 2},zoompan=z='1+(${z.z}-1)*on/${n}':x='(iw-iw/zoom)*${z.fx}':y='(ih-ih/zoom)*${z.fy}':d=1:s=${FW}x${FH}:fps=${FPS},pad=1920:1080:${FX}:0:color=0x${spec.bg ?? "0b1017"},format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "16", "-preset", "fast", f]);
      off += len;
    } else if (p.scene) {
      const len = p.fit ? share(p) : (p.hold ?? d);
      const sc = sceneClip(p.scene, p.cues ?? {}, p.fit ? len : Math.max(len, d - off));
      ff(["-i", sc, "-t", String(p.fit ? len : Math.max(len, d - off)), "-vf", `scale=1920:1080,fps=${FPS},format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "16", "-preset", "fast", f]);
      off += p.fit ? len : Math.max(len, d - off);
    } else {
      const sp = p.speed ?? (p.fit ? (p.se - p.ss) / share(p) : 1);
      if (p.fit && (sp > 3.2 || sp < 0.6)) warns.push(`${b.name}: piece ${pi} speed ${sp.toFixed(2)}`);
      let vf = `setpts=(PTS-STARTPTS)/${sp.toFixed(4)}`;
      if (p.zoom) vf += `,crop=iw/${p.zoom.z}:ih/${p.zoom.z}:(iw-iw/${p.zoom.z})*${p.zoom.fx}:(ih-ih/${p.zoom.z})*${p.zoom.fy}`;
      vf += `,scale=${FW}:${FH}:flags=lanczos,setsar=1,pad=1920:1080:${FX}:0:color=0x${spec.bg ?? "0b1017"},fps=${FPS},format=yuv420p`;
      ff(["-ss", String(p.ss), "-to", String(p.se), "-i", R(p.clip), "-vf", vf, "-an", "-c:v", "libx264", "-crf", "16", "-preset", "fast", f]);
      if (p.marks) {
        const m = JSON.parse(fs.readFileSync(R(p.marks), "utf8"));
        for (const bx of m.boxes ?? []) if (bx.t >= p.ss && bx.t < p.se && (!p.only || p.only.includes(bx.name)) && !(p.skip ?? []).includes(bx.name)) {
          const k = 1920 / bx.iw; // the page's own viewport width when the box was measured (tab zoom included)
          let [x, y, w, h] = [bx.x * k, bx.y * k, bx.w * k, bx.h * k];
          if (bx.panel) { const [px, py, pw, ph] = bx.panel; if (bx.x < px - 4 || bx.y < py - 4 || bx.x + bx.w > px + pw + 4 || bx.y + bx.h > py + ph + 4 || bx.y < 0 || bx.y + bx.h > bx.ih + 4 || bx.x < 0 || bx.x + bx.w > bx.iw + 4) throw new Error(`box ${bx.name} falls outside its panel or the viewport: ${JSON.stringify([bx.x, bx.y, bx.w, bx.h])} panel ${JSON.stringify(bx.panel)}`); }
          if (p.zoom) { const z = p.zoom.z; const x0 = (1920 - 1920 / z) * p.zoom.fx, y0 = (1080 - 1080 / z) * p.zoom.fy; x = (x - x0) * z; y = (y - y0) * z; w *= z; h *= z; }
          x = x * KZ + FX; y *= KZ; w *= KZ; h *= KZ;
          // clip the rectangle to the frame and cap very tall targets so the outline stays a callout, not a frame
          const x1 = Math.max(10, x), y1 = Math.max(10, y), x2 = Math.min(1910, x + w), y2 = Math.min(1070, y + h);
          boxes.push({ a: off + (bx.t - p.ss) / sp, b: off + Math.min(bx.t - p.ss + bx.hold, p.se - p.ss) / sp, rect: [x1, y1, x2 - x1, y2 - y1].map(Math.round), name: bx.name });
        }
      }
      off += (p.se - p.ss) / sp;
    }
    pieceFiles.push(f);
  });
  const list = path.join(work, `b${bi}.txt`); fs.writeFileSync(list, pieceFiles.map((f) => `file '${f}'`).join("\n"));
  const raw = path.join(work, `b${bi}-raw.mp4`); ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", raw]);
  const have = probe(raw);
  if (have > d + 0.1) warns.push(`${b.name}: visual ${have.toFixed(2)}s, beat ${d.toFixed(2)}s (trimmed ${(have - d).toFixed(2)}s)`);
  if (have < d - 0.1) warns.push(`${b.name}: visual ${have.toFixed(2)}s, beat ${d.toFixed(2)}s (last frame held ${(d - have).toFixed(2)}s)`);
  const inputs = ["-i", raw]; let chain = `[0:v]tpad=stop_mode=clone:stop_duration=${Math.max(0, d - have + 0.2).toFixed(3)},trim=duration=${d},setpts=PTS-STARTPTS[o0];`; let cur = "o0"; let n = 1;
  const add = (png, a, bb, fade = 0.2) => {
    inputs.push("-loop", "1", "-t", String(d), "-i", png); const k = n++;
    chain += `[${k}:v]format=rgba,fade=t=in:st=${a.toFixed(2)}:d=${fade}:alpha=1,fade=t=out:st=${Math.max(a, bb - fade).toFixed(2)}:d=${fade}:alpha=1[l${k}];[${cur}][l${k}]overlay=0:0:format=auto:enable='between(t,${a.toFixed(2)},${bb.toFixed(2)})'[v${k}];`; cur = `v${k}`;
  };
  for (const bx of boxes) { const label = (spec.labels ?? {})[bx.name]; if (label === false) continue; add(still("box", { box: bx.rect, label: label ?? "", err: (spec.errBoxes ?? []).includes(bx.name), pos: (spec.labelPos ?? {})[bx.name] ?? "above" }), bx.a, Math.min(d - 0.05, bx.b), 0.2); }
  for (const o of b.overlays ?? []) add(still(o.scene, o.cues ?? {}), o.a, Math.min(d - 0.05, o.b), o.fade ?? 0.25);
  if (b.caption !== false && spec.captions !== false) {
    const lines = b.ids.map((id) => byId[id]);
    lines.forEach((l, li) => {
      const a = Math.max(0, l.start - t0 - 0.05);
      const next = li + 1 < lines.length ? lines[li + 1].start - t0 - 0.05 : Math.min(d, l.end - t0 + 0.4);
      add(still("caption", { text: l.cap ?? l.text, bottom: b.pieces.some((p) => p.clip || p.still) ? 14 : 44 }), a, Math.max(a + 0.5, Math.min(d, next)), 0.15);
    });
  }
  flush();
  ff([...inputs, "-filter_complex", chain.slice(0, -1), "-map", `[${cur}]`, "-t", String(d), "-r", String(FPS), "-c:v", "libx264", "-crf", "16", "-preset", "fast", "-pix_fmt", "yuv420p", "-an", path.join(work, `beat${bi}.mp4`)]);
  files.push(path.join(work, `beat${bi}.mp4`));
  console.error(`beat ${bi} ${b.name}: ${t0.toFixed(2)}-${t1.toFixed(2)} (${d}s) boxes ${boxes.length}`);
});
if (PRE) {
  if (sjobs.length) { const jf = R("work/sc/jobs.json"); fs.writeFileSync(jf, JSON.stringify(sjobs)); lockRun(["node", R("scene.mjs"), "--batch", jf]); }
  console.error("pre pass done: " + sjobs.length + " scene clips"); process.exit(0);
}
const all = path.join(work, "all.txt"); fs.writeFileSync(all, files.map((f) => `file '${f}'`).join("\n"));
const video = path.join(work, "video.mp4"); ff(["-f", "concat", "-safe", "0", "-i", all, "-c", "copy", video]);
const total = probe(video);
ff(["-i", video, "-i", R(spec.audio), "-filter_complex", `[1:a]aresample=48000,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},afade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", R(spec.out)]);
console.log(JSON.stringify({ out: R(spec.out), seconds: probe(R(spec.out)), warnings: warns }, null, 1));
