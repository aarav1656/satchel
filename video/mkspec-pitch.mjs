// node mkspec-pitch.mjs : write pitch.spec.json. Scenes are timed from the narration timeline; clips are the real demo recording.
import fs from "node:fs";
const tl = JSON.parse(fs.readFileSync("vo/out-pitch/timeline.json", "utf8")); const T = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
const LEAD = 0.12;
const c = (n, ss, se, o = {}) => ({ clip: `work/final/${n}.mp4`, marks: `work/final/${n}/marks.json`, ss, se, ...o });
const mech0 = T.p07.start - LEAD;
const hi = JSON.parse(fs.readFileSync("work/src-openai.json", "utf8"));
const src = { img: "../work/src-openai.png", w: 2200, h: 1520, crop: [80, 130, 1500, 700], maxH: 780, maxW: 1560, top: 90, label: "OpenAI Help Center, Memory in ChatGPT, read 13 October 2026",
  hi: [[hi.list[0][0] - 52, hi.list[0][1] - 6, 760, hi.list[4][1] + 48 - hi.list[0][1] + 12, 2.2, 5.0], [hi.decides[0], hi.decides[1], hi.decides[2], hi.decides[3], 5.2]] };
const spec = {
  out: "satchel-pitch.mp4", timeline: "vo/out-pitch/timeline.json", audio: "vo/out-pitch/narration.wav", work: "work/compose-pitch", lead: LEAD, bg: "080c15",
  labels: { "fern-read": "Read 2 of 2 memories", "fern-locked": "GRANT_REVOKED", "fern-read0": "Read 0 of 2 memories" },
  errBoxes: ["fern-locked", "fern-read0"],
  beats: [
    { name: "read", ids: ["p01"], pieces: [c("c5-grant", 36.4, 41.7, { fit: true, only: ["fern-read"] })] },
    { name: "none", ids: ["p02"], pieces: [c("c6-revoke", 29.8, 33.8, { fit: true, only: ["fern-locked"] })] },
    { name: "tag", ids: ["p03"], pieces: [{ scene: "tag", cues: {}, fit: true }] },
    { name: "pick", ids: ["p04"], pieces: [{ scene: "problem", cues: {}, fit: true }] },
    { name: "source", ids: ["p05"], pieces: [{ scene: "source", cues: src, fit: true }] },
    { name: "stuck", ids: ["p06"], pieces: [c("c3-fern", 0.5, 8.7, { fit: true })], caption: true },
    { name: "mech", ids: ["p07", "p08", "p09"], pieces: [{ scene: "mech", cues: { t8: +(T.p08.start - mech0).toFixed(2), t9: +(T.p09.start - mech0).toFixed(2) }, fit: true }] },
    { name: "monad", ids: ["p10"], pieces: [{ scene: "ledger", cues: {}, fit: true }] },
    { name: "proof", ids: ["p11", "p12"], pieces: [{ scene: "proof", cues: { rows: JSON.parse(fs.readFileSync("work/proof-rows.json", "utf8")) }, fit: true }] },
    { name: "sdk", ids: ["p13"], pieces: [c("c7-sdk", 1.5, 9.9, { fit: true, only: ["qs-out"] })] },
    { name: "layers", ids: ["p14"], pieces: [{ scene: "layers", cues: {}, fit: true }] },
    { name: "cta", ids: ["p15"], pieces: [{ scene: "cta", cues: {}, fit: true }] },
  ],
};
fs.writeFileSync("pitch.spec.json", JSON.stringify(spec, null, 1));
console.log(JSON.stringify({ total: tl.total, mech0, t8: spec.beats[6].pieces[0].cues }));
