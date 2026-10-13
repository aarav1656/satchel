// node mkspec-demo.mjs : write demo.spec.json. Cut points come from the marks each clip recorded, so a re-record needs no edits here.
import fs from "node:fs";
const D = "work/final4";
const marks = {}; const box = {};
for (const n of ["c1-vault", "c2-tell", "c3-fern", "c4-fund", "c5-grant", "c6-revoke", "c7-sdk"]) { const m = JSON.parse(fs.readFileSync(`${D}/${n}/marks.json`, "utf8")); marks[n] = m.marks; box[n] = Object.fromEntries(m.boxes.map((b) => [b.name, b.t])); marks[n]._dur = m.duration; }
const c = (n, ss, se, o = {}) => ({ clip: `${D}/${n}.mp4`, marks: `${D}/${n}/marks.json`, ss: +ss.toFixed(2), se: +Math.min(se, marks[n]._dur).toFixed(2), ...o });
const chain = JSON.parse(fs.readFileSync("work/chain.json", "utf8"));
const m1 = marks["c1-vault"], m2 = marks["c2-tell"], m3 = marks["c3-fern"], m4 = marks["c4-fund"], m5 = marks["c5-grant"], m6 = marks["c6-revoke"], m7 = marks["c7-sdk"];
const QS = { z: 2.3, fx: 0.43, fy: 0.51 };
const REV = { z: 2.5, fx: 0.07, fy: 0.55 };
const spec = {
  out: "satchel-demo.mp4", timeline: "vo/out-demo/timeline.json", audio: "vo/out-demo/narration.wav", work: "work/compose-demo", lead: 0.12, bg: "080c15",
  labels: { "vault-btn": "Create the vault with my passkey", owner: "Vault open", sealed: "Stored scrambled", allow: "Fern asks. I decide.", balance0: false, balance1: false, "grant-tx": "The grant, on Monad", "fern-open": "Opened with Fern's own key", "fern-read": "Fern used both facts", revoked: "Revoked: lock version 2", "fern-locked": "Locked again", "fern-read0": "Fern can't open them", "qs-out": "The quickstart, run for real" },
  errBoxes: ["revoked", "fern-locked", "fern-read0"],
  labelPos: { "fern-read": "below", "fern-read0": "below", "grant-tx": "below" },
  beats: [
    { name: "title", ids: ["e01"], pieces: [{ scene: "title", cues: { html: "Every new AI app asks who you are. <em>Again.</em>" }, fit: true }] },
    { name: "goal", ids: ["e02"], pieces: [{ still: `${D}/c1-vault.mp4`, at: 1.0, fit: true, push: { z: 1.06, fx: 0.4, fy: 0.45 } }] },
    { name: "vault", ids: ["e03"], pieces: [c("c1-vault", box["c1-vault"]["vault-btn"] - 0.3, m1["vault-open"] + 3.0, { fit: true })] },
    { name: "tell", ids: ["e04"], pieces: [c("c2-tell", m2["pip1-type"], m2["sealed1"] + 1.5, { fit: true })] },
    { name: "second", ids: ["e05"], pieces: [c("c2-tell", m2["pip2-type"], m2["sealed2"], { fit: true })] },
    { name: "scrambled", ids: ["e06"], pieces: [c("c2-tell", m2["sealed2"], m2._dur, { fit: true })] },
    { name: "fern", ids: ["e07"], pieces: [c("c3-fern", 1.1, 6.0, { fit: true })] },
    { name: "connect", ids: ["e08"], pieces: [c("c3-fern", 6.0, m3._dur, { speed: 1.2 }), c("c4-fund", 0.5, m4._dur, { fit: true })] },
    { name: "grant", ids: ["e10"], pieces: [c("c5-grant", 0, m5["granted"] + 3.3, { fit: true })] },
    { name: "split", ids: ["e11"], pieces: [{ scene: "split", cues: { from: 3 }, fit: true }] },
    { name: "fern-open", ids: ["e12"], pieces: [c("c5-grant", m5["return-click"] + 0.6, m5["fern1-type"] - 0.5, { fit: true })] },
    { name: "plan", ids: ["e13"], pieces: [c("c5-grant", m5["fern1-type"] - 0.5, m5["fern1-sent"], { speed: 9 }), c("c5-grant", m5["fern1-sent"], m5["fern1-reply"] - 0.2, { speed: 9 }), c("c5-grant", m5["fern1-reply"] - 0.2, m5._dur, { fit: true })] },
    { name: "revoke", ids: ["e14", "e15"], pieces: [c("c6-revoke", m6["revoke-click"] - 1.0, m6["revoke-click"] + 0.9, { speed: 1, zoom: REV }), c("c6-revoke", m6["revoked"] + 0.15, Math.min(m6["revoked"] + 4.2, m6["to-pip"] + 0.3), { fit: true, zoom: REV })] },
    { name: "ask-again", ids: ["e16"], pieces: [c("c6-revoke", m6["to-fern"] - 0.4, m6["fern1-type"] + 0.6, { fit: true })] },
    { name: "generic", ids: ["e17"], pieces: [c("c6-revoke", m6["fern1-type"] + 0.6, m6["fern1-sent"], { speed: 14 }), c("c6-revoke", m6["fern1-sent"], m6["fern1-reply"] - 0.2, { speed: 12 }), c("c6-revoke", m6["fern1-reply"] - 0.2, m6._dur, { fit: true })] },
    { name: "chain", ids: ["e18"], pieces: [{ scene: "chain", cues: { lines: chain.lines, roll: chain.roll }, fit: true }] },
    { name: "sdk", ids: ["e19"], pieces: [c("c7-sdk", m7["qs-click"], m7._dur, { fit: true, zoom: QS })] },
    { name: "cta", ids: ["e20"], pieces: [{ scene: "cta", cues: { line: "My AI's memory follows me to any app I allow, and one tap takes it back." }, fit: true }] },
  ],
};
fs.writeFileSync("demo.spec.json", JSON.stringify(spec, null, 1));
