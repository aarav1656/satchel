// First-run scenarios for the quickstart, every click by real input (Input.dispatchMouseEvent) except scenario synthetic.
// SCENARIO = a | b | c | synthetic. Each starts from a cleared `satchel` IndexedDB and cleared localStorage and sessionStorage
// on the tested origin, done on a script-free page (/icon.svg) so no open IndexedDB connection can block the delete.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const HOST = new URL(ORIGIN).hostname;
const SCENARIO = process.env.SCENARIO ?? "a";
const T = (id) => `document.querySelector('[data-testid="${id}"]')`;
const OUT = `(${T("quickstart-output")}?.innerText ?? '')`;
const FP = `((${OUT}).match(/fp=([0-9a-f]{8})/)||[])[1]`;
const BUTTONS = `[...document.querySelectorAll('.proof-live button')].map(b=>b.innerText.trim()).join(' | ')`;
const PROMPTS = `(document.querySelector('.proof-live .small.muted:last-child')?.innerText.match(/so far: (\\d+)/)||[])[1]`;
const MARKER = `(async()=>{const d=await new Promise((res,rej)=>{const r=indexedDB.open('satchel');r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const v=await new Promise((res,rej)=>{const r=d.transaction('kv').objectStore('kv').get('satchel/known/${HOST}');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});d.close();return v===undefined?'ABSENT':v.byteLength===0?'EMPTY':new TextDecoder().decode(v)})()`;

const CLEAR = [
  { navigate: `${ORIGIN}/icon.svg` },
  { eval: `(async()=>{localStorage.clear();sessionStorage.clear();await new Promise(r=>{const q=indexedDB.deleteDatabase('satchel');q.onsuccess=q.onerror=q.onblocked=()=>r()});const dbs=(await indexedDB.databases()).map(d=>d.name);return 'cleared '+location.origin+' ; localStorage keys='+localStorage.length+' ; IndexedDB databases='+JSON.stringify(dbs)})()`, label: "clear origin storage" },
  { assert: `(async()=>localStorage.length===0&&!(await indexedDB.databases()).some(d=>d.name==='satchel'))()`, label: "satchel IndexedDB and localStorage are empty on this origin" },
  { navigate: `${ORIGIN}/` },
  { eval: `(async()=>'RUNNING ' + navigator.userAgent.match(/Chrome\\/[\\d.]+/)?.[0] + ' ; origin ' + location.origin + ' ; marker ' + await ${MARKER})()`, label: "conditions" },
];
const FIRST_VISIT = { poll: `${BUTTONS} === 'Create a passkey | I already have one' && ${BUTTONS}`, label: "first visit shows exactly Create a passkey and I already have one" };
const RUN_ONLY = { poll: `${BUTTONS} === 'Run the code above' && ${BUTTONS}`, label: "marker present: the page shows exactly Run the code above" };
const DONE = (what) => ({ poll: `${OUT}.includes('sha256') && ${OUT}`, timeout: 60000, label: `${what} finished` });
const SHOW = (what) => ({ eval: `'${what}: ' + (${OUT}).replace(/\\n/g,' | ') + ' ; prompts so far=' + ${PROMPTS}`, label: what });

const scenarios = {
  // (a) first-time Create, then a fresh load and "Run the code above" opens with the same fingerprint
  a: [
    ...CLEAR,
    FIRST_VISIT,
    { tclick: "Create a passkey" },
    DONE("create run"),
    SHOW("CREATE run output"),
    { assert: `${OUT}.includes('(1 prompt)') && ${PROMPTS} === '1'`, label: "Create used exactly one passkey prompt" },
    { eval: `${FP}`, save: "fp1", label: "remember fp" },
    { poll: `${BUTTONS} === 'Run the code above'`, label: "after Create the page shows one Run button" },
    { eval: `(async()=>'MARKER ' + await ${MARKER})()`, label: "marker written by openOrEnrol" },
    { navigate: `${ORIGIN}/`, fresh: true },
    RUN_ONLY,
    { tclick: "Run the code above" },
    DONE("later run"),
    SHOW("RUN run output"),
    { assert: `${OUT}.includes('(1 prompt)') && ${PROMPTS} === '1'`, label: "later run used exactly one passkey prompt" },
    { assert: `${FP} === __VAR_fp1__`, label: "the fresh load's Run opened the same passkey: fingerprint equal to the first run" },
    { eval: `'SAME FINGERPRINT first=' + __VAR_fp1__ + ' later=' + ${FP}`, label: "fingerprints" },
  ],
  // (b) a marker that outlives its passkey (a fresh virtual authenticator): PASSKEY_NOT_FOUND, then Create recovers
  b: [
    ...CLEAR,
    FIRST_VISIT,
    { tclick: "Create a passkey" },
    DONE("create run"),
    SHOW("CREATE run output"),
    { eval: `${FP}`, save: "fp1", label: "first passkey fingerprint" },
    { eval: `(async()=>'MARKER before the authenticator is replaced: ' + await ${MARKER})()`, label: "marker" },
    { vauth: "reset" },
    { navigate: `${ORIGIN}/`, fresh: true },
    RUN_ONLY,
    { tclick: "Run the code above" },
    { poll: `${OUT}.includes('PASSKEY_NOT_FOUND') && ${OUT}`, timeout: 60000, label: "the stale marker ends in PASSKEY_NOT_FOUND" },
    SHOW("STALE run output"),
    { poll: `${BUTTONS} === 'Create a passkey | I already have one' && ${BUTTONS}`, label: "both choices are back" },
    { assert: `${PROMPTS} === '1'`, label: "the stale run used one passkey prompt (one get, no create)" },
    { eval: `(async()=>'MARKER after PASSKEY_NOT_FOUND: ' + await ${MARKER})()`, label: "marker deleted" },
    { assert: `(async()=>(await ${MARKER}) === 'ABSENT')()`, label: "the stale marker is gone from IndexedDB" },
    { tclick: "Create a passkey" },
    DONE("recovery create run"),
    SHOW("RECOVERY output"),
    { assert: `${OUT}.includes('sealed  ns=memory/assistant') && ${FP} !== __VAR_fp1__`, label: "Create recovered with a new passkey (a different fingerprint)" },
    { poll: `${BUTTONS} === 'Run the code above'`, label: "after recovery the page shows one Run button" },
    { eval: `'FINGERPRINTS old=' + __VAR_fp1__ + ' new=' + ${FP}`, label: "fingerprints" },
  ],
  // (c) "I already have one" with no credential: a clear message, not a trap
  c: [
    ...CLEAR,
    FIRST_VISIT,
    { tclick: "I already have one" },
    { poll: `${OUT}.includes('PASSKEY_NOT_FOUND') && ${OUT}`, timeout: 60000, label: "no credential ends in PASSKEY_NOT_FOUND" },
    SHOW("OPEN with nothing output"),
    { poll: `${BUTTONS} === 'Create a passkey | I already have one' && ${BUTTONS}`, label: "both choices are still there" },
    { assert: `${PROMPTS} === '1'`, label: "one passkey prompt, no chained create" },
    { assert: `(async()=>(await ${MARKER}) === 'ABSENT')()`, label: "nothing was remembered" },
    { tclick: "Create a passkey" },
    DONE("create after the message"),
    SHOW("CREATE after the message"),
    { eval: `'FINGERPRINT ' + ${FP}`, label: "fingerprint" },
  ],
  // the same first click as (a) by synthetic element.click(), recorded as it happens
  synthetic: [
    ...CLEAR,
    FIRST_VISIT,
    { click: "Create a passkey" },
    { poll: `${OUT} !== '' && ${OUT}`, timeout: 60000, label: "synthetic click produced output" },
    SHOW("SYNTHETIC click output"),
    { eval: `(async()=>'MARKER ' + await ${MARKER})()`, label: "marker after the synthetic click" },
  ],
};
// The trap on the build that shipped before the fix (one "Run the code above" button, the marker forces open()): run it against
// that build to see the failure the fix removes. It cannot pass on the fixed build, which has no such button on a first visit.
scenarios.trap = [
  ...CLEAR.slice(0, 3),
  { navigate: `${ORIGIN}/` },
  { poll: `${BUTTONS} === 'Run the code above' && ${BUTTONS}`, label: "old build: one Run button" },
  { tclick: "Run the code above" },
  DONE("old build first run"),
  SHOW("OLD first run output"),
  { vauth: "reset" },
  { navigate: `${ORIGIN}/`, fresh: true },
  { tclick: "Run the code above" },
  { poll: `${OUT} !== '' && ${OUT}`, timeout: 60000, label: "old build with a stale marker" },
  SHOW("OLD stale run 1"),
  { tclick: "Run the code above" },
  { wait: 3000 },
  SHOW("OLD stale run 2"),
  { eval: `(async()=>'MARKER ' + await ${MARKER})()`, label: "the marker is still there" },
  { eval: `'BUTTONS ' + ${BUTTONS}`, label: "the only button is the one that fails" },
];
export default scenarios[SCENARIO];
