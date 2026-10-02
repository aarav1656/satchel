// node check.mjs <ceremony.log>: asserts the claims from the recorded RESULT lines. Exits 1 on any failed claim.
import fs from "node:fs";
const text = fs.readFileSync(process.argv[2], "utf8");
const runs = {};
let cur;
for (const l of text.split("\n")) {
  const m = l.match(/^=== RUN (\d)/);
  if (m) { cur = runs[m[1]] = []; continue; }
  if (cur && l.startsWith("RESULT ")) cur.push(JSON.parse(l.slice(7)));
}
const find = (n, action, impl, load = "1") => runs[n]?.find((r) => r.action === action && r.impl === impl && r.load === load);
const eq = (a, b) => a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
const claims = [];
const claim = (name, ok) => claims.push([name, !!ok]);
const A = find(1, "create", "patched"), As = find(1, "signin", "patched"), Al = find(1, "signin", "legacy"), A2 = find(1, "signin", "patched", "2");
const B = find(2, "create", "patched"), C = find(3, "create", "mutant"), Cs = find(3, "signin", "mutant");
const D = find(4, "create", "legacy"), Ds = find(4, "signin", "legacy"), Dp = find(4, "signin", "patched");
claim("patched createAccount: 1 prompt", A?.prompts === 1);
claim("patched signIn: 1 prompt", As?.prompts === 1);
claim("unpatched signIn: 2 prompts", Al?.prompts === 2 && Ds?.prompts === 2);
claim("unpatched createAccount: 2 prompts", D?.prompts === 2);
claim("patched signIn == created addresses (both roles)", eq(As?.owner, A?.owner) && eq(As?.trading, A?.trading));
claim("main's signIn on the patch's passkey returns the same two addresses", eq(Al?.owner, A?.owner) && eq(Al?.trading, A?.trading));
claim("patch's signIn on main's passkey returns main's two addresses", eq(Dp?.owner, D?.owner) && eq(Dp?.trading, D?.trading));
claim("deterministic across a fresh page load", eq(A2?.owner, A?.owner) && eq(A2?.trading, A?.trading) && A2?.prompts === 1);
claim("a different passkey yields different owner and trading keys", B && !eq(B.owner, A.owner) && !eq(B.trading, A.trading));
claim("owner and trading differ within one passkey", A && !eq(A.owner, A.trading));
for (const [who, n] of [["patched", 1], ["legacy", 1]]) {
  claim(`withOwnerKey (${who} impl) on the patched record: 1 prompt, matches record`, find(n, "owner", who)?.prompts === 1 && find(n, "owner", who)?.matchesRecord === true);
  claim(`openTradingSession (${who} impl) on the patched record: 1 prompt, matches record`, find(n, "trading", who)?.prompts === 1 && find(n, "trading", who)?.matchesRecord === true);
}
claim("patched withOwnerKey and openTradingSession accept a record made by main", find(4, "owner", "patched")?.matchesRecord === true && find(4, "trading", "patched")?.matchesRecord === true);
claim("control: mutant (second output discarded) needs 2 prompts for create and signIn", C?.prompts === 2 && Cs?.prompts === 2);
claim("control: mutant still returns the same addresses, so the fallback never changes a key", eq(Cs?.owner, C?.owner) && eq(Cs?.trading, C?.trading));
claim("no RETRY or ERROR line in any run", !/^(RETRY|ERROR) /m.test(text));
claim("every run produced results (non-empty)", Object.keys(runs).length === 4 && Object.values(runs).every((r) => r.length >= 2));
let bad = 0;
for (const [name, ok] of claims) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) bad++; }
console.log(`${claims.length - bad}/${claims.length} claims hold`);
process.exit(bad ? 1 : 0);
