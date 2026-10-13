// The assistant loop through the real entry point: land on /, create the vault in Pip, tell Pip two facts that last, see them sealed,
// allow Fern (a Monad testnet transaction), Fern answers from them, revoke (a transaction), Pip seals again, Fern's next read is
// GRANT_REVOKED and it answers without them, regrant, Fern answers again.
// Run by scripts/assistant-e2e.sh, which funds the Pip owner (outside the page) once the page has shown its address.
// LLM=live uses the deployed /api/chat as is. Without it, window.fetch answers /api/chat for the browser run only, standing in for
// the model so the sealing, grant, revoke and read legs can be exercised when AI Gateway is not available; every request body the
// page sends is recorded in window.__chat and asserted, so what the page hands the model is checked either way.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const LIVE = process.env.LLM === "live";
const T = (id) => `document.querySelector('[data-testid="${id}"]')`;
const all = (id) => `[...document.querySelectorAll('[data-testid="${id}"]')]`;
const FUNDED = "/tmp/satchel-assistant-funded";
const CLEAR = `(async()=>{localStorage.clear();sessionStorage.clear();await Promise.all(['fern','satchel'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=()=>r()})));return 'cleared '+location.origin})()`;

const MOCK = `(()=>{
  window.__chat = [];
  const real = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    if (!String(u).includes('/api/chat')) return real(u, o);
    const b = JSON.parse(o.body);
    window.__chat.push(b);
    const last = b.messages[b.messages.length - 1].content;
    let reply, remembered = [];
    if (b.app === 'pip') {
      if (/vegetarian/i.test(last)) remembered.push('Vegetarian');
      if (/BLR/.test(last)) remembered.push('Flies out of BLR (Bengaluru)');
      reply = remembered.length ? 'Kept: ' + remembered.join(', ') : 'Noted.';
    } else {
      reply = b.memories.length ? 'Weekend plan built from: ' + b.memories.join('; ') : 'I cannot see any memories of yours, so tell me what you like.';
    }
    return new Response(JSON.stringify({ reply, remembered }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return 'chat stand-in installed';
})()`;

const say = (app, text) => [
  { type_into: { sel: `#${app}-chat-input`, text } },
  { tclick: "Send" },
];
// Pip's transcript can start with the probe turn below, so Pip counts are relative to the assistant turns present after it.
const turnsDone = (app, n) => `${all("turn")}.filter(t=>t.closest('[data-testid="${app}-chat"]')&&t.dataset.role==='assistant').length === ${n} + (${app === "pip" ? "window.__base || 0" : "0"}) && !${T("thinking")}`;

export default [
  // 1. the front door
  { navigate: `${ORIGIN}/icon.svg` },
  { eval: CLEAR, label: "clear origin storage" },
  { navigate: `${ORIGIN}/` },
  { poll: `!!${T("home-pip")} && !!${T("home-fern")}`, label: "/ shows both apps" },
  { eval: `'HOME h1="' + document.querySelector('h1').innerText + '" | ' + document.querySelector('.home-hero p').innerText + ' | pip: ' + ${T("home-pip-status")}.innerText + ' | fern: ' + ${T("home-fern-status")}.innerText + ' | link=' + ${T("home-link")}.dataset.state`, label: "landing" },
  { assert: `document.querySelector('h1').innerText.includes('sealed to your passkey') && !document.querySelector('[data-snippet="quickstart"]') && !!document.querySelector('a[href="/pip/"]') && !!document.querySelector('a[href="/fern/"]')`, label: "/ is the product, not the docs quickstart" },
  { assert: `${T("home-link")}.dataset.state === 'none' && ${T("home-pip-status")}.innerText.includes('No vault')`, label: "a first visit shows no vault and no grant" },
  { navigate: `${ORIGIN}/docs/` },
  { poll: `!!document.querySelector('[data-snippet="quickstart"]')`, label: "the docs quickstart lives at /docs" },
  // 2. Pip: vault, then tell it two facts
  { navigate: `${ORIGIN}/pip/` },
  { poll: `document.body.innerText.includes('Create your vault')`, label: "Pip asks for a vault before it will chat" },
  { assert: `!document.getElementById('pip-chat-input')`, label: "no chat box until the vault is open" },
  { tclick: "Create my vault" },
  { poll: `!!document.getElementById('pip-chat-input') && !!${T("owner-address")}`, timeout: 40000, label: "vault open, chat box and owner address shown" },
  { eval: `'OWNER address=' + ${T("owner-address")}.innerText + ' balance=' + ${T("owner-balance")}.innerText`, label: "owner" },
  // what the deployed chat endpoint does right now, before any stand-in is installed: a reply, or its error shown in the page
  ...say("pip", "Hello."),
  { poll: `!!${T("chat-error")} || ${all("turn")}.some(t=>t.dataset.role==='assistant')`, timeout: 90000, label: "the chat endpoint answered the page" },
  { eval: `(()=>{window.__base=${all("turn")}.filter(t=>t.dataset.role==='assistant').length;return 'ENDPOINT ' + (${T("chat-error")} ? 'error box: ' + ${T("chat-error")}.innerText.replace(/\\n/g,' | ') : 'reply: ' + ${all("turn")}.filter(t=>t.dataset.role==='assistant').pop().innerText.replace(/\\n/g,' | ')) + ' | memories sealed by it: ' + ${all("memory-row")}.length})()`, label: "endpoint probe" },
  ...(LIVE ? [] : [{ eval: MOCK, label: "model stand-in" }]),
  ...say("pip", "I'm vegetarian."),
  { poll: `${turnsDone("pip", 1)} && ${all("memory-row")}.length >= 1`, timeout: 90000, label: "Pip answered and a memory was sealed" },
  ...say("pip", "I fly out of BLR."),
  { poll: `${turnsDone("pip", 2)} && ${all("memory-row")}.length >= 2`, timeout: 90000, label: "second fact sealed" },
  { eval: `'PIP turns ' + ${all("turn")}.map(t=>t.dataset.role+': '+t.querySelector('.turn-body').innerText.replace(/\\n+/g,' / ')).join(' || ')`, label: "transcript" },
  { eval: `'MEMORIES ' + ${all("memory-row")}.map(r=>'e'+r.dataset.epoch+' "'+r.querySelector('.memory-text').innerText+'" '+r.querySelector('.memory-meta').innerText+' '+r.querySelector('.memory-cipher').innerText).join(' ; ')`, label: "what Pip remembers, with the sealed envelope" },
  { assert: `/vegetarian/i.test(${all("memory-row")}.map(r=>r.querySelector('.memory-text').innerText).join(' ')) && /BLR/.test(${all("memory-row")}.map(r=>r.querySelector('.memory-text').innerText).join(' '))`, label: "both facts are in the panel, opened with the passkey" },
  { assert: `${all("memory-row")}.every(r=>/ fp [0-9a-f]{8}/.test(r.querySelector('.memory-meta').innerText) && /^0x53415431/.test(r.querySelector('.memory-cipher').title))`, label: "each row shows epoch, size, fingerprint and a SAT1 ciphertext" },
  { eval: `(()=>{const raw=localStorage.getItem('satchel.pip.memories');return 'STORAGE '+JSON.parse(raw).length+' rows, plaintext present: '+/vegetarian|BLR|Bengaluru/i.test(raw)})()`, label: "what the page stored" },
  { assert: `!/vegetarian|BLR|Bengaluru/i.test(localStorage.getItem('satchel.pip.memories'))`, label: "storage holds ciphertext only, no fact in clear" },
  { assert: `${turnsDone("pip", 2)} && ${all("turn-sealed")}.length === 2`, label: "the transcript shows what was sealed" },
  { eval: `'CHAT bodies sent: ' + (window.__chat ? window.__chat.length : 'n/a')`, label: "requests" },
  ...(LIVE ? [] : [
    { assert: `window.__chat[0].memories.length === 0 && window.__chat[1].memories.join('|') === 'Vegetarian'`, label: "Pip hands the model only what it had unsealed so far" },
  ]),
  // 3. Fern: connect, allow, answer from the memories
  { tclick_sel: `.top-nav a[href="/fern/"]` },
  { poll: `!!${T("fern-empty")}`, label: "Fern before a grant" },
  { assert: `!document.getElementById('fern-chat-input')`, label: "Fern cannot chat before it holds a grant" },
  { tclick: "Connect to your memory" },
  { poll: `!!${T("allow-card")}`, label: "Pip sharing shows the Allow card" },
  { eval: `'CONNECT app=' + new URLSearchParams(location.search).get('app') + ' pub=' + new URLSearchParams(location.search).get('connect')`, label: "connect code" },
  { wait_file: FUNDED },
  { tclick: "Check balance" },
  { poll: `/0\\.[0-9]+ MON/.test(${T("owner-balance")}.innerText) && ${T("owner-balance")}.innerText`, label: "owner funded" },
  { tclick: "Allow" },
  { poll: `!!${T("granted")} && ${T("grant-tx")}.dataset.hash`, timeout: 120000, label: "grant confirmed" },
  { eval: `'GRANT id=' + ${all("grant-row")}[0].dataset.grantId + ' tx=' + ${T("grant-tx")}.dataset.hash`, label: "grant" },
  { tclick: "Return to Fern" },
  { poll: `${all("fern-row")}.length === 2 && ${all("fern-row")}.every(r=>r.dataset.state === 'open') && !!document.getElementById('fern-chat-input')`, timeout: 60000, label: "Fern opens both memories through its grant" },
  ...say("fern", "Plan my weekend."),
  { poll: `${turnsDone("fern", 1)}`, timeout: 90000, label: "Fern answered" },
  { eval: `'FERN answer: ' + ${all("turn")}.filter(t=>t.dataset.role==='assistant').pop().querySelector('.turn-body').innerText.replace(/\\n+/g,' / ')`, label: "Fern's answer before the revoke" },
  { assert: `${T("turn-read")}.dataset.open === '2' && ${T("turn-read")}.dataset.locked === '0'`, label: "Fern read 2 of 2 memories" },
  { assert: `(()=>{const t=${all("turn")}.filter(t=>t.dataset.role==='assistant').pop().innerText;return /vegetarian/i.test(t) && /BLR|Bengaluru/i.test(t)})()`, label: "the plan uses the vegetarian and BLR facts" },
  ...(LIVE ? [] : [
    { assert: `window.__chat[window.__chat.length-1].app === 'fern' && window.__chat[window.__chat.length-1].memories.length === 2`, label: "Fern handed the model the two memories it opened" },
  ]),
  // 4. Pip revokes: the folder moves to epoch 2 and every memory is sealed again there
  { tclick_sel: `.top-nav a[href="/pip/"]` },
  { tclick_sel: `.app-bar nav a[href="/pip/share/"]` },
  { poll: `${all("grant-row")}.length === 1 && ${all("grant-row")}[0].dataset.active === 'true'`, timeout: 20000, label: "Sharing lists Fern as active" },
  { tclick: "Revoke Fern" },
  { poll: `!!${T("revoke-tx")} && ${T("revoke-tx")}.dataset.hash && ${all("grant-row")}[0].innerText.includes('sealed 2 memories again at epoch 2')`, timeout: 150000, label: "revoke confirmed and the memories sealed again" },
  { eval: `'REVOKE id=' + ${all("grant-row")}[0].dataset.grantId + ' tx=' + ${T("revoke-tx")}.dataset.hash + ' | ' + ${all("grant-row")}[0].innerText.replace(/\\n/g,' | ')`, label: "revoke" },
  { tclick_sel: `.app-bar nav a[href="/pip/"]` },
  { poll: `${all("memory-row")}.length === 2 && ${all("memory-row")}.every(r=>r.dataset.epoch === '2') && ${all("memory-row")}.every(r=>!r.querySelector('.memory-locked'))`, timeout: 40000, label: "Pip still opens both, now sealed at epoch 2" },
  { eval: `'PIP after revoke ' + ${all("memory-row")}.map(r=>'e'+r.dataset.epoch+' "'+r.querySelector('.memory-text').innerText+'"').join(' ; ')`, label: "memories after the reseal" },
  // 5. Fern's next read
  { tclick_sel: `.top-nav a[href="/fern/"]` },
  { poll: `${T("fern-status")}?.dataset.active === 'false' && ${all("fern-row")}.length === 2`, timeout: 40000, label: "Fern shows the revoked grant" },
  { assert: `${all("fern-row")}.every(r=>r.dataset.state === 'locked' && r.innerText.includes('GRANT_REVOKED'))`, label: "every memory is locked as GRANT_REVOKED" },
  ...say("fern", "Plan my weekend."),
  // opening Fern again starts a fresh transcript, so this is Fern's first turn on this page load
  { poll: `${turnsDone("fern", 1)}`, timeout: 90000, label: "Fern answered after the revoke" },
  { eval: `'FERN after revoke: ' + ${all("turn")}.filter(t=>t.dataset.role==='assistant').pop().querySelector('.turn-body').innerText.replace(/\\n+/g,' / ')`, label: "Fern's answer after the revoke" },
  { assert: `(()=>{const r=${all("turn-read")}.pop();return r.dataset.open === '0' && r.dataset.locked === '2' && r.innerText.includes('GRANT_REVOKED')})()`, label: "Fern's read: 0 of 2 opened, GRANT_REVOKED" },
  { assert: `!/vegetarian|BLR|Bengaluru/i.test(${all("turn")}.filter(t=>t.dataset.role==='assistant').pop().innerText.replace(/GRANT_REVOKED/g,''))`, label: "the answer after the revoke does not use the memories" },
  ...(LIVE ? [] : [
    { assert: `window.__chat[window.__chat.length-1].app === 'fern' && window.__chat[window.__chat.length-1].memories.length === 0`, label: "Fern handed the model no memories after the revoke" },
  ]),
  // 6. regrant: Fern asks again at the new epoch and reads once more
  { tclick: "Ask Pip for a new grant" },
  { poll: `!!${T("allow-card")}`, label: "Pip offers Allow again" },
  { tclick: "Allow" },
  { poll: `!!${T("granted")} && ${T("grant-tx")}.dataset.hash`, timeout: 120000, label: "regrant confirmed" },
  { eval: `'REGRANT tx=' + ${T("grant-tx")}.dataset.hash + ' ids=' + ${all("grant-row")}.map(r=>r.dataset.grantId+':'+r.dataset.active).join(',')`, label: "regrant" },
  { tclick: "Return to Fern" },
  { poll: `${all("fern-row")}.length === 2 && ${all("fern-row")}.every(r=>r.dataset.state === 'open') && ${T("fern-status")}?.dataset.active === 'true'`, timeout: 60000, label: "after the regrant Fern opens both again, at epoch 2" },
  { eval: `'FERN regrant rows ' + ${all("fern-row")}.map(r=>'e'+r.dataset.epoch+' '+r.dataset.state).join(' ; ')`, label: "regrant rows" },
];
