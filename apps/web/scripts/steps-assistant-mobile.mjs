// 390x844 pass over the product screens with content on them, DOM reads only. Run: W=390 H=844 VAUTH=1 drive.mjs <origin>/ this-file.
// Creates a vault (virtual passkey), seals two facts through the page with the chat stand-in, and checks the layout of /, Pip with
// memories, and Fern's gate. No transaction is sent, so nothing is funded.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const T = (id) => `document.querySelector('[data-testid="${id}"]')`;
const all = (id) => `[...document.querySelectorAll('[data-testid="${id}"]')]`;
const NO_SIDE_SCROLL = `document.documentElement.scrollWidth <= document.documentElement.clientWidth`;
const INSIDE = (sel) => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()`;
const MOCK = `(()=>{const real=window.fetch.bind(window);window.fetch=async(u,o)=>{if(!String(u).includes('/api/chat'))return real(u,o);const b=JSON.parse(o.body);const last=b.messages[b.messages.length-1].content;const remembered=[];if(/vegetarian/i.test(last))remembered.push('Vegetarian');if(/BLR/.test(last))remembered.push('Flies out of BLR (Bengaluru)');return new Response(JSON.stringify({reply:remembered.length?'Kept: '+remembered.join(', '):'Noted.',remembered}),{status:200,headers:{'content-type':'application/json'}})};return 'chat stand-in installed'})()`;
const CLEAR = `(async()=>{localStorage.clear();await Promise.all(['fern','satchel'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=()=>r()})));return 'cleared'})()`;

export default [
  { navigate: `${ORIGIN}/icon.svg` },
  { eval: CLEAR, label: "clear origin storage" },
  { navigate: `${ORIGIN}/` },
  { poll: `!!${T("home-pip")}`, label: "landing at 390 wide" },
  { eval: `'HOME viewport=' + innerWidth + 'x' + innerHeight + ' h1.y=' + Math.round(document.querySelector('h1').getBoundingClientRect().top) + ' pip.y=' + Math.round(${T("home-pip")}.getBoundingClientRect().top + scrollY) + ' fern.y=' + Math.round(${T("home-fern")}.getBoundingClientRect().top + scrollY) + ' link=' + Math.round(${T("home-link")}.getBoundingClientRect().height) + 'px tall, ' + Math.round(${T("home-link")}.getBoundingClientRect().width) + 'px wide'`, label: "landing geometry" },
  { assert: NO_SIDE_SCROLL, label: "no sideways scroll on /" },
  { assert: `(()=>{const p=${T("home-pip")}.getBoundingClientRect(),l=${T("home-link")}.getBoundingClientRect(),f=${T("home-fern")}.getBoundingClientRect();return p.bottom <= l.top && l.bottom <= f.top && l.height >= 48})()`, label: "the apps stack with the grant line in the gap between them" },
  { assert: `${T("home-pip")}.querySelector('a.btn').getBoundingClientRect().top < innerHeight * 2`, label: "the Open Pip button is within two screens of the top" },
  { assert: `[...document.querySelectorAll('.top-nav a')].every(a => { const r = a.getBoundingClientRect(); return r.right <= innerWidth && r.height < 48 })`, label: "the top nav fits on one row" },
  { navigate: `${ORIGIN}/pip/` },
  { poll: `document.body.innerText.includes('Create your vault')`, label: "Pip before a vault" },
  { assert: NO_SIDE_SCROLL, label: "no sideways scroll on /pip/ before a vault" },
  { tclick: "Create my vault" },
  { poll: `!!document.getElementById('pip-chat-input')`, timeout: 40000, label: "vault open" },
  { eval: MOCK, label: "chat stand-in (the sealing is real)" },
  { type_into: { sel: "#pip-chat-input", text: "I'm vegetarian and I fly out of BLR." } },
  { tclick: "Send" },
  { poll: `${all("memory-row")}.length === 2 && !${T("thinking")}`, timeout: 60000, label: "two facts sealed" },
  { assert: NO_SIDE_SCROLL, label: "no sideways scroll on /pip/ with memories" },
  { assert: `${INSIDE("#pip-chat-input")} && ${INSIDE('[data-testid="memory-list"]')} && ${all("memory-row")}.every(r => r.getBoundingClientRect().right <= innerWidth)`, label: "chat box and memory rows sit inside 390px" },
  { eval: `'PIP geometry input=' + JSON.stringify(document.getElementById('pip-chat-input').getBoundingClientRect().toJSON()) + ' send=' + Math.round([...document.querySelectorAll('.chat-form button')][0].getBoundingClientRect().width) + 'px wide, memory row ciphertext="' + ${all("memory-row")}[0].querySelector('.memory-cipher').innerText + '"'`, label: "pip geometry" },
  { assert: `getComputedStyle(document.getElementById('pip-chat-input')).fontSize === '16px'`, label: "the chat input is 16px so iOS does not zoom on focus" },
  { tclick_sel: `.top-nav a[href="/fern/"]` },
  { poll: `!!${T("fern-empty")}`, label: "Fern gate" },
  { assert: `(${NO_SIDE_SCROLL}) && (${INSIDE('[data-testid="fern-empty"]')})`, label: "no sideways scroll on /fern/ and the gate sits inside 390px" },
];
