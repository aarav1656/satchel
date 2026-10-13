// node mkspec-demo.mjs : write demo.spec.json (the cut of the demo clips onto the narration timeline).
import fs from "node:fs";
const c = (n, ss, se, o = {}) => ({ clip: `work/final2/${n}.mp4`, marks: `work/final2/${n}/marks.json`, ss, se, ...o });
const chain = JSON.parse(fs.readFileSync("work/chain.json", "utf8"));
const run = JSON.parse(fs.readFileSync("work/run.json", "utf8"));
const QS = { z: 1.8, fx: 0.54, fy: 0.15 };
const spec = {
  out: "satchel-demo.mp4", timeline: "vo/out-demo/timeline.json", audio: "vo/out-demo/narration.wav", work: "work/compose-demo", lead: 0.12, bg: "080c15",
  labels: { owner: "Vault open", sealed: "Stored scrambled", allow: "Fern asks. I decide.", balance0: "Small network fee", balance1: "Funded", "grant-tx": "The grant, on Monad", "fern-open": "Opened with Fern's own key", "fern-read": "Used both facts", revoked: "One tap: revoke", epoch2: "Locked again, new key", "fern-locked": "Fern is locked out", "fern-read0": "None of my facts", "qs-out": "The quickstart, run for real" },
  errBoxes: ["revoked", "fern-locked", "fern-read0"],
  beats: [
    { name: "title", ids: ["e01"], pieces: [{ scene: "title", cues: { html: "Every new AI app asks who you are. <em>Again.</em>" }, fit: true }] },
    { name: "goal", ids: ["e02"], pieces: [{ still: "work/final2/c1-vault.mp4", at: 1.0, fit: true, push: { z: 1.06, fx: 0.4, fy: 0.45 } }] },
    { name: "vault", ids: ["e03"], pieces: [c("c1-vault", 1.2, 6.5, { fit: true })] },
    { name: "tell", ids: ["e04"], pieces: [c("c2-tell", 0.8, 11.0, { fit: true })] },
    { name: "second", ids: ["e05"], pieces: [c("c2-tell", 11.0, 32.0, { fit: true })] },
    { name: "scrambled", ids: ["e06"], pieces: [c("c2-tell", 32.0, 37.2, { fit: true })] },
    { name: "fern", ids: ["e07"], pieces: [c("c3-fern", 1.1, 6.0, { fit: true })] },
    { name: "connect", ids: ["e08"], pieces: [c("c3-fern", 6.0, 8.6, { fit: true })] },
    { name: "fund", ids: ["e09"], pieces: [c("c4-fund", 0.5, 7.0, { fit: true })] },
    { name: "grant", ids: ["e10"], pieces: [c("c5-grant", 0, 7.8, { fit: true })] },
    { name: "split", ids: ["e11"], pieces: [{ scene: "split", cues: { from: 3 }, fit: true }] },
    { name: "fern-open", ids: ["e12"], pieces: [c("c5-grant", 7.94, 13.2, { fit: true })] },
    { name: "plan", ids: ["e13"], pieces: [c("c5-grant", 13.2, 21.7, { speed: 3 }), c("c5-grant", 21.7, 28.6, { speed: 4 }), c("c5-grant", 28.6, 32.8, { fit: true })] },
    { name: "revoke", ids: ["e14"], pieces: [c("c6-revoke", 2.0, 5.7, { speed: 1.6 }), c("c6-revoke", 5.7, 10.8, { fit: true })] },
    { name: "reseal", ids: ["e15"], pieces: [c("c6-revoke", 10.8, 19.1, { fit: true })] },
    { name: "locked", ids: ["e16"], pieces: [c("c6-revoke", 19.15, 25.3, { fit: true })] },
    { name: "generic", ids: ["e17"], pieces: [c("c6-revoke", 25.3, 33.5, { speed: 10 }), c("c6-revoke", 33.5, 37.6, { speed: 4 }), c("c6-revoke", 37.6, 42.3, { fit: true })] },
    { name: "chain", ids: ["e18"], pieces: [{ scene: "chain", cues: { lines: chain.lines, roll: chain.roll }, fit: true }] },
    { name: "sdk", ids: ["e19"], pieces: [c("c7-sdk", 3.99, 11.4, { fit: true, zoom: QS })] },
    { name: "cta", ids: ["e20"], pieces: [{ scene: "cta", cues: { line: "My AI's memory follows me to any app I allow, and one tap takes it back." }, fit: true }] },
  ],
};
fs.writeFileSync("demo.spec.json", JSON.stringify(spec, null, 1));
