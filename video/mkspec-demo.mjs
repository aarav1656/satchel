// node mkspec-demo.mjs : write demo.spec.json (the cut of the demo clips onto the narration timeline) from the recorded marks.
import fs from "node:fs";
const C = (n) => ({ clip: `work/final/${n}.mp4`, marks: `work/final/${n}/marks.json` });
const c = (n, ss, se, o = {}) => ({ ...C(n), ss, se, ...o });
const chain = JSON.parse(fs.readFileSync("work/chain.json", "utf8"));
const spec = {
  out: "satchel-demo.mp4", timeline: "vo/out-demo/timeline.json", audio: "vo/out-demo/narration.wav", work: "work/compose-demo", lead: 0.12, bg: "080c15",
  labels: { owner: "Owner address, derived from the passkey", sealed: "Sealed at epoch 1, ciphertext only", allow: "Fern asks to read this folder", balance0: "The owner needs gas to grant", balance1: "Funded", "grant-tx": "Grant transaction on Monad", "fern-open": "Opened with Fern's own key", "fern-read": "Read 2 of 2 memories", revoked: "Revoked, memories sealed again at epoch 2", epoch2: "Same memories, sealed at epoch 2", "fern-locked": "GRANT_REVOKED", "fern-read0": "Read 0 of 2 memories", "qs-out": "The quickstart, run for real" },
  errBoxes: ["revoked", "fern-locked", "fern-read0"],
  beats: [
    { name: "goal", ids: ["d01"], pieces: [{ still: "work/final/c1-vault.mp4", at: 1.0, fit: true, push: { z: 1.06, fx: 0.4, fy: 0.45 } }] },
    { name: "vault", ids: ["d02"], pieces: [c("c1-vault", 1.2, 6.4, { fit: true })] },
    { name: "tell", ids: ["d03"], pieces: [c("c2-tell", 0.8, 9.6, { fit: true })] },
    { name: "seal", ids: ["d04"], pieces: [c("c2-tell", 9.6, 15.2, { fit: true })] },
    { name: "second", ids: ["d05b"], pieces: [c("c2-tell", 15.2, 34.1, { fit: true })] },
    { name: "cipher", ids: ["d05"], pieces: [c("c2-tell", 34.1, 39.5, { fit: true })] },
    { name: "fern", ids: ["d06"], pieces: [c("c3-fern", 1.1, 6.0, { fit: true })] },
    { name: "connect", ids: ["d07"], pieces: [c("c3-fern", 6.0, 12.5, { speed: 1.3 }), c("c4-fund", 0, 3.5, { fit: true })] },
    { name: "fund", ids: ["d08"], pieces: [c("c4-fund", 3.5, 12.69, { fit: true })] },
    { name: "grant", ids: ["d09"], pieces: [c("c5-grant", 0, 9.8, { fit: true })] },
    { name: "split", ids: ["d09b"], pieces: [{ scene: "split", cues: {}, fit: true }] },
    { name: "fern-open", ids: ["d10b"], pieces: [c("c5-grant", 9.89, 15.0, { fit: true })] },
    { name: "ask", ids: ["d10"], pieces: [c("c5-grant", 15.0, 21.0, { fit: true })] },
    { name: "plan", ids: ["d11", "d11b"], pieces: [c("c5-grant", 21.0, 30.65, { speed: 8 }), c("c5-grant", 30.65, 37.3, { speed: 8 }), c("c5-grant", 37.3, 41.7, { fit: true })] },
    { name: "revoke", ids: ["d12"], pieces: [c("c6-revoke", 2.0, 8.5, { speed: 3 }), c("c6-revoke", 8.5, 14.4, { fit: true })] },
    { name: "reseal", ids: ["d12b"], pieces: [c("c6-revoke", 14.4, 25.0, { fit: true })] },
    { name: "locked", ids: ["d13"], pieces: [c("c6-revoke", 25.08, 33.3, { fit: true })] },
    { name: "generic", ids: ["d14"], pieces: [c("c6-revoke", 33.3, 47.1, { speed: 14 }), c("c6-revoke", 47.1, 50.1, { speed: 4 }), c("c6-revoke", 50.1, 54.5, { fit: true })] },
    { name: "chain", ids: ["d15", "d15b"], pieces: [{ scene: "chain", cues: { lines: chain.lines, roll: chain.roll }, fit: true }] },
    { name: "sdk", ids: ["d16"], pieces: [c("c7-sdk", 0, 4.0, { fit: true })] },
    { name: "run", ids: ["d17", "d17b"], pieces: [c("c7-sdk", 4.04, 13.9, { fit: true })] },
    { name: "cta", ids: ["d18"], pieces: [{ scene: "cta", cues: {}, fit: true }] },
  ],
};
fs.writeFileSync("demo.spec.json", JSON.stringify(spec, null, 1));
