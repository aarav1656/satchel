// node mkspec-pitch.mjs : write pitch.spec.json. Cut points come from the marks each clip recorded.
import fs from "node:fs";
const D = "work/final4";
const marks = {};
for (const n of ["c2-tell", "c3-fern", "c5-grant", "c6-revoke", "c7-sdk"]) { const m = JSON.parse(fs.readFileSync(`${D}/${n}/marks.json`, "utf8")); marks[n] = m.marks; marks[n]._dur = m.duration; }
const c = (n, ss, se, o = {}) => ({ clip: `${D}/${n}.mp4`, marks: `${D}/${n}/marks.json`, ss: +ss.toFixed(2), se: +Math.min(se, marks[n]._dur).toFixed(2), ...o });
const m2 = marks["c2-tell"], m3 = marks["c3-fern"], m5 = marks["c5-grant"], m6 = marks["c6-revoke"], m7 = marks["c7-sdk"];
const run = JSON.parse(fs.readFileSync("work/run.json", "utf8"));
const hi = JSON.parse(fs.readFileSync("work/src-openai.json", "utf8"));
const src = { img: "../work/src-openai.png", w: 2200, h: 1520, crop: [80, 130, 1500, 700], maxH: 700, maxW: 1500, top: 70, label: "Source: OpenAI Help Center, Memory in ChatGPT, read 13 October 2026",
  hi: [[hi.list[0][0] - 52, hi.list[0][1] - 6, 760, hi.list[4][1] + 48 - hi.list[0][1] + 12, 1.2, 3.6], [hi.decides[0], hi.decides[1], hi.decides[2], hi.decides[3], 3.9]] };
const QS = { z: 2.3, fx: 0.43, fy: 0.51 };
const REV = { z: 2.5, fx: 0.07, fy: 0.55 };
const spec = {
  out: "satchel-pitch.mp4", timeline: "vo/out-pitch/timeline.json", audio: "vo/out-pitch/narration.wav", work: "work/compose-pitch", lead: 0.12, bg: "080c15",
  labels: { sealed: "Stored scrambled", allow: "Fern asks. You decide.", "fern-read": "Fern used both facts", "balance0": false, "balance1": false, revoked: "Revoked: lock version 2", "fern-locked": "Fern can't open them", "fern-read0": "Fern can't open them", "qs-out": "The quickstart, run for real", "grant-tx": "The grant, on Monad" },
  errBoxes: ["revoked", "fern-locked", "fern-read0"],
  labelPos: { "fern-read": "below", "fern-read0": "below", "grant-tx": "below" },
  beats: [
    { name: "empty", ids: ["q01"], pieces: [{ scene: "problem", cues: { only: "A" }, fit: true }] },
    { name: "source", ids: ["q02"], pieces: [{ scene: "source", cues: src, fit: true }] },
    { name: "pick", ids: ["q03"], pieces: [{ scene: "problem", cues: { only: "B" }, fit: true }] },
    { name: "third", ids: ["q04"], pieces: [{ scene: "title", cues: { html: "Your memory, in every app <em>you allow.</em>" }, fit: true }] },
    { name: "pip", ids: ["q05"], pieces: [c("c2-tell", m2["pip1-type"], m2["sealed1"] + 1.5, { fit: true })] },
    { name: "scrambled", ids: ["q06"], pieces: [c("c2-tell", m2["sealed2"], m2._dur, { fit: true })] },
    { name: "fern", ids: ["q07"], pieces: [c("c3-fern", 1.1, 6.0, { fit: true })] },
    { name: "grant", ids: ["q08"], pieces: [c("c5-grant", 0, m5["granted"] + 3.3, { fit: true })] },
    { name: "plan", ids: ["q09"], pieces: [c("c5-grant", m5["fern1-type"] - 0.5, m5["fern1-sent"], { speed: 9 }), c("c5-grant", m5["fern1-sent"], m5["fern1-reply"] - 0.2, { speed: 9 }), c("c5-grant", m5["fern1-reply"] - 0.2, m5._dur, { fit: true })] },
    { name: "revoke", ids: ["q10"], pieces: [c("c6-revoke", m6["revoke-click"] - 1.0, m6["revoke-click"] + 0.9, { speed: 1, zoom: REV }), c("c6-revoke", m6["revoked"] + 0.15, Math.min(m6["revoked"] + 4.2, m6["to-pip"] + 0.3), { fit: true, zoom: REV })] },
    { name: "gone", ids: ["q11"], pieces: [{ scene: "mech", cues: { t8: 8.3, t9: 14.9, from: 26, run }, fit: true }] },
    { name: "again", ids: ["q12"], pieces: [c("c6-revoke", m6["fern1-type"] + 0.6, m6["fern1-sent"], { speed: 14 }), c("c6-revoke", m6["fern1-sent"], m6["fern1-reply"] - 0.2, { speed: 12 }), c("c6-revoke", m6["fern1-reply"] - 0.2, m6._dur, { fit: true })] },
    { name: "ledger", ids: ["q13"], pieces: [{ scene: "ledger", cues: { run }, fit: true }] },
    { name: "sdk", ids: ["q14"], pieces: [c("c7-sdk", m7["qs-click"], m7._dur, { fit: true, zoom: QS })] },
    { name: "cta", ids: ["q15"], pieces: [{ scene: "cta", cues: { line: "Your AI's memory follows you to any app you allow, and one tap takes it back." }, fit: true }] },
  ],
};
fs.writeFileSync("pitch.spec.json", JSON.stringify(spec, null, 1));
