// Negative control for the /proof prompt counter in steps-click-through.mjs: from an empty origin, one vault prompt reads as exactly 1,
// and one extra navigator.credentials.get call moves the same counter to 2, so the assert "== 1" can fail.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const COUNT = `(window.__prompts.get + window.__prompts.create)`;
export default [
  { navigate: `${ORIGIN}/icon.svg` },
  { eval: `(async()=>{localStorage.clear();sessionStorage.clear();await Promise.all(['fern','satchel'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=()=>r()})));return 'cleared '+location.origin})()`, label: "clear origin storage" },
  { navigate: `${ORIGIN}/proof/`, fresh: true },
  { eval: `(()=>{const c=navigator.credentials;window.__prompts={get:0,create:0};const g=c.get.bind(c),m=c.create.bind(c);c.get=(...a)=>{window.__prompts.get++;return g(...a)};c.create=(...a)=>{window.__prompts.create++;return m(...a)};return 'prompt counter installed'})()`, label: "count navigator.credentials calls" },
  { eval: `'before any click: ' + ${COUNT}`, label: "counter starts at 0" },
  { assert: `${COUNT} === 0`, label: "no prompt before the click" },
  { tclick: "Create my vault" },
  { poll: `!!document.querySelector('[data-testid="proof-vault-open"]') && !!document.querySelector('[data-testid="derivation"]')?.innerText`, timeout: 40000, label: "vault open" },
  { eval: `'after Create my vault: get=' + window.__prompts.get + ' create=' + window.__prompts.create`, label: "counter after the one click" },
  { assert: `${COUNT} === 1`, label: "one vault click (Create my vault, the empty-origin label) is exactly one prompt" },
  { eval: `navigator.credentials.get({publicKey:{challenge:new Uint8Array(32),rpId:location.hostname,timeout:2000}}).catch(()=>0).then(()=>'extra get issued: get=' + window.__prompts.get + ' create=' + window.__prompts.create)`, label: "one extra prompt by hand" },
  { assert: `${COUNT} === 2`, label: "the counter moves to 2, so an extra prompt on the page would fail the == 1 assert" },
];
