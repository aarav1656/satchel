import { REGISTRY_ADDRESS } from "./config";

/**
 * The quickstart, as the text shown on / and the text the Run button executes. Both import this constant, so there is
 * one copy. scripts/check-built.mjs compares it with the built page and fails the build if they differ.
 * Plain JavaScript on purpose: it is executed as written.
 */
export const QUICKSTART = `import { openOrEnrol, ns } from "satchel-sdk";

const mode = "enrol"; // "open" when this person already has a passkey; a first visit needs one, later visits ignore it
const s = await openOrEnrol({ rpId: location.hostname, appName: "My app", mode });
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });                  // Sealed, safe to store anywhere
const back = await s.unsealJson(memory, blob);                                 // { likes: "metric units" }`;

/** The text the Run button executes: QUICKSTART with its one `mode` line set to the button the person pressed. */
export const quickstartFor = (mode: "enrol" | "open"): string => QUICKSTART.replace('const mode = "enrol";', `const mode = "${mode}";`);

/** The install line shown on / and run by devflow/quickstart.sh, so a copied line and a tested line are one string. */
export const INSTALL = "npm i satchel-sdk@0.1.0 @category-labs/mera@0.2.0";

/** Node has no passkey, so the PRF output comes from the caller: a server-side reader, a test, a script. Run as written with `node quickstart.mjs`. */
export const NODE_QUICKSTART = `import { fromPrfOutput, ns } from "satchel-sdk";

const prf = crypto.getRandomValues(new Uint8Array(32));   // a real app passes the 32 byte PRF output its passkey returned
const s = await fromPrfOutput(prf, { rpId: "localhost" });
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });
const back = await s.unsealJson(memory, blob);
console.log(JSON.stringify(back));                        // {"likes":"metric units"}`;

export const SECOND_NAMESPACE = `const notes = ns("memory/notes");
const note = await s.seal(notes, "call the dentist");   // a new folder, no second prompt
await s.fingerprint(notes);                              // b4e6cf3b, equal on every device with this passkey`;

/** Self-contained: every name it uses is defined in it. */
export const GRANT_AND_REVOKE = `import { createGrantee, fetchGrant, ns, openOrEnrol } from "satchel-sdk";

const registry = { address: "${REGISTRY_ADDRESS}" };   // Monad testnet
const memory = ns("memory/assistant");

// App B (Fern) makes its own key. It never touches the passkey. fern.publicKey goes to the owner over any channel.
const fern = await createGrantee();

// App A (Pip) holds the passkey: it seals a record and grants Fern.
const s = await openOrEnrol({ rpId: location.hostname, appName: "Pip", registry, mode: "enrol" });
const blob = await s.seal(memory, { likes: "metric units" });
const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });   // one Monad transaction

// App B needs only grant.txHash and the sealed bytes. It rebuilds the grant from the receipt and reads.
const mine = await fetchGrant({ txHash: grant.txHash, registry, ns: memory });
await fern.reader(mine).unsealJson(blob);

// App A takes the access back: epoch 1 to 2, one Monad transaction.
await s.revoke(memory, grant.id);`;
