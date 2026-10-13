// node mkspec-pitch.mjs : write pitch.spec.json. Scenes are timed from the narration timeline; clips are the real demo recording.
import fs from "node:fs";
const tl = JSON.parse(fs.readFileSync("vo/out-pitch/timeline.json", "utf8")); const T = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
const LEAD = 0.12;
const c = (n, ss, se, o = {}) => ({ clip: `work/final2/${n}.mp4`, marks: `work/final2/${n}/marks.json`, ss, se, ...o });
const run = JSON.parse(fs.readFileSync("work/run.json", "utf8"));
const chainLines = JSON.parse(fs.readFileSync("work/chain.json", "utf8"));
const hi = JSON.parse(fs.readFileSync("work/src-openai.json", "utf8"));
const src = { img: "../work/src-openai.png", w: 2200, h: 1520, crop: [80, 130, 1500, 700], maxH: 780, maxW: 1560, top: 90, label: "OpenAI Help Center, Memory in ChatGPT, read 13 October 2026",
  hi: [[hi.list[0][0] - 52, hi.list[0][1] - 6, 760, hi.list[4][1] + 48 - hi.list[0][1] + 12, 1.2, 3.6], [hi.decides[0], hi.decides[1], hi.decides[2], hi.decides[3], 3.9]] };
const mech0 = T.q10.start - LEAD;
const QS = { z: 1.8, fx: 0.54, fy: 0.15 };
const spec = {
  out: "satchel-pitch.mp4", timeline: "vo/out-pitch/timeline.json", audio: "vo/out-pitch/narration.wav", work: "work/compose-pitch", lead: LEAD, bg: "080c15",
  labels: { sealed: "Stored scrambled", allow: "Fern asks. You decide.", "fern-read": "Fern used both facts", revoked: "One tap: revoke", "fern-locked": "Fern can't open them", "fern-read0": "Fern can't open them", "qs-out": "The quickstart, run for real" },
  errBoxes: ["revoked", "fern-locked", "fern-read0"],
  beats: [
    { name: "empty", ids: ["q01"], pieces: [{ scene: "problem", cues: { only: "A" }, fit: true }] },
    { name: "source", ids: ["q02"], pieces: [{ scene: "source", cues: src, fit: true }] },
    { name: "pick", ids: ["q03"], pieces: [{ scene: "problem", cues: { only: "B" }, fit: true }] },
    { name: "third", ids: ["q04"], pieces: [{ scene: "title", cues: { html: "Your memory, in every app <em>you allow.</em>" }, fit: true }] },
    { name: "pip", ids: ["q05"], pieces: [c("c2-tell", 0.8, 11.0, { fit: true })] },
    { name: "scrambled", ids: ["q06"], pieces: [c("c2-tell", 32.0, 37.2, { fit: true })] },
    { name: "fern", ids: ["q07"], pieces: [c("c3-fern", 1.1, 6.0, { fit: true })] },
    { name: "grant", ids: ["q08"], pieces: [c("c3-fern", 6.0, 8.6, { fit: true }), c("c5-grant", 0, 7.8, { fit: true })] },
    { name: "plan", ids: ["q09"], pieces: [c("c5-grant", 13.2, 21.7, { speed: 3 }), c("c5-grant", 21.7, 28.6, { speed: 4 }), c("c5-grant", 28.6, 32.8, { fit: true })] },
    { name: "revoke", ids: ["q10"], pieces: [c("c6-revoke", 2.0, 5.7, { speed: 1.6 }), c("c6-revoke", 5.7, 10.8, { fit: true })] },
    { name: "gone", ids: ["q11"], pieces: [{ scene: "mech", cues: { t8: 8.3, t9: 14.9, from: 26, run }, fit: true }] },
    { name: "again", ids: ["q12"], pieces: [c("c6-revoke", 25.3, 33.5, { speed: 10 }), c("c6-revoke", 33.5, 37.6, { speed: 4 }), c("c6-revoke", 37.6, 42.3, { fit: true, skip: ["fern-read0"] })] },
    { name: "ledger", ids: ["q13"], pieces: [{ scene: "ledger", cues: { run }, fit: true }] },
    { name: "sdk", ids: ["q14"], pieces: [c("c7-sdk", 3.99, 11.4, { fit: true, zoom: QS })] },
    { name: "cta", ids: ["q15"], pieces: [{ scene: "cta", cues: { line: "Your AI's memory follows you to any app you allow, and one tap takes it back." }, fit: true }] },
  ],
};
fs.writeFileSync("pitch.spec.json", JSON.stringify(spec, null, 1));
