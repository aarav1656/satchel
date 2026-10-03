// A second passkey, as a person does it in Pip: create the vault, seal a memory, try the second-passkey button before one exists
// (NO_SECOND_PASSKEY, the control), add a second passkey, delete the first from the authenticator, open the vault from a fresh page
// load with the second passkey: same fingerprint, same owner address, the memory reads back.
const ORIGIN = process.env.ORIGIN ?? "http://satchel.localhost:5190";
const T = (id) => `document.querySelector('[data-testid="${id}"]')`;
const all = (id) => `[...document.querySelectorAll('[data-testid="${id}"]')]`;
const CLEAR = `(async()=>{localStorage.clear();sessionStorage.clear();await Promise.all(['fern','satchel'].map(n=>new Promise(r=>{const q=indexedDB.deleteDatabase(n);q.onsuccess=q.onerror=q.onblocked=()=>r()})));return 'cleared '+location.origin})()`;
const FP = `${all("rail-fp")}[0]?.textContent.trim()`;

export default [
  { navigate: `${ORIGIN}/icon.svg` },
  { eval: CLEAR, label: "clear origin storage" },
  { navigate: `${ORIGIN}/pip/` },
  { poll: `document.body.innerText.includes('Create your vault')`, label: "Pip first run offers Create" },
  { tclick: "Create my vault" },
  { poll: `!!${T("owner-address")}`, timeout: 40000, label: "vault created, owner address shown" },
  { eval: `${T("owner-address")}.innerText.trim()`, save: "owner1", label: "owner address before" },
  { tclick: "Save to memory" },
  { poll: `${all("memory-row")}.length === 1 && /^[0-9a-f]{8}$/.test(${FP})`, timeout: 40000, label: "one memory sealed, fingerprint shown" },
  { eval: `${FP}`, save: "fp1", label: "fingerprint before" },
  { eval: `${all("memory-row")}[0].querySelector('.memory-text').innerText`, save: "text1", label: "memory text before" },
  // control: nothing was added, so the second-passkey open must refuse
  { navigate: `${ORIGIN}/pip/`, fresh: true },
  { poll: `document.body.innerText.includes('Your vault is closed')`, label: "vault closed after a fresh load" },
  { tclick: "Open with my second passkey" },
  { poll: `${T("error")}?.innerText.includes('NO_SECOND_PASSKEY') && ${T("error")}.innerText`, timeout: 40000, label: "CONTROL: second-passkey open before one is added is NO_SECOND_PASSKEY" },
  { eval: `'CONTROL ' + ${T("error")}.innerText.replace(/\\n+/g,' | ').slice(0, 260)`, label: "control text" },
  // add the second passkey while the first opens the vault
  { tclick: "Open my vault" },
  { poll: `${all("memory-row")}.length === 1 && ${FP} === __VAR_fp1__`, timeout: 40000, label: "first passkey opens the vault, same fingerprint" },
  { tclick: "Add a second passkey" },
  { poll: `!!${T("second-status")} && ${T("second-status")}.innerText`, timeout: 60000, label: "second passkey added" },
  { vauth: "drop_first" },
  { navigate: `${ORIGIN}/pip/`, fresh: true },
  { poll: `document.body.innerText.includes('Your vault is closed')`, label: "vault closed after a fresh load, first passkey deleted" },
  { tclick: "Open with my second passkey" },
  { poll: `${all("memory-row")}.length === 1 && /^[0-9a-f]{8}$/.test(${FP})`, timeout: 40000, label: "second passkey opened the vault" },
  { assert: `${FP} === __VAR_fp1__`, label: "same fingerprint as the first passkey" },
  { assert: `${T("owner-address")}.innerText.trim() === __VAR_owner1__`, label: "same registry owner address as the first passkey" },
  { assert: `${all("memory-row")}[0].querySelector('.memory-text').innerText === __VAR_text1__`, label: "the memory sealed under the first passkey reads back" },
  { eval: `'SECOND PASSKEY opened: fp=' + ${FP} + ' owner=' + ${T("owner-address")}.innerText.trim() + ' memory="' + ${all("memory-row")}[0].querySelector('.memory-text').innerText + '"'`, label: "result" },
];
