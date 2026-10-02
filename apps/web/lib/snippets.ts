import { REGISTRY_ADDRESS } from "./config";

/**
 * The quickstart, as the text shown on / and the text the Run button executes. Both import this constant, so there is
 * one copy. scripts/check-built.mjs compares it with the built page and fails the build if they differ.
 * Plain JavaScript on purpose: it is executed as written.
 */
export const QUICKSTART = `import { openOrEnrol, ns } from "@satchel/sdk";

const s = await openOrEnrol({ rpId: location.hostname, appName: "My app" }); // opens your passkey, or creates one the first time
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });                  // Sealed, safe to store anywhere
const back = await s.unsealJson(memory, blob);                                 // { likes: "metric units" }`;

export const SECOND_NAMESPACE = `const notes = ns("memory/notes");
const note = await s.seal(notes, "call the dentist");   // a new folder, no second prompt
await s.fingerprint(notes);                              // b4e6cf3b, equal on every device with this passkey`;

/** Self-contained: every name it uses is defined in it. */
export const GRANT_AND_REVOKE = `import { createGrantee, fetchGrant, ns, openOrEnrol } from "@satchel/sdk";

const registry = { address: "${REGISTRY_ADDRESS}" };   // Monad testnet
const memory = ns("memory/assistant");

// App B (Fern) makes its own key. It never touches the passkey. fern.publicKey goes to the owner over any channel.
const fern = await createGrantee();

// App A (Pip) holds the passkey: it seals a record and grants Fern.
const s = await openOrEnrol({ rpId: location.hostname, appName: "Pip", registry });
const blob = await s.seal(memory, { likes: "metric units" });
const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });   // one Monad transaction

// App B needs only grant.txHash and the sealed bytes. It rebuilds the grant from the receipt and reads.
const mine = await fetchGrant({ txHash: grant.txHash, registry, ns: memory });
await fern.reader(mine).unsealJson(blob);

// App A takes the access back: epoch 1 to 2, one Monad transaction.
await s.revoke(memory, grant.id);`;
