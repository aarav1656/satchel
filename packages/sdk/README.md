# satchel-sdk

One passkey, many namespaced keys. Seal data per app, hand a second app a revocable read grant, and cut it off with an epoch bump on Monad.

Your users' data stays theirs. An AI assistant's memory, a trading journal or a settings blob is sealed in the browser under a key derived from the person's passkey. No server holds a key, no seed phrase exists, and the ciphertext is safe to store anywhere. When a second app needs the data, the person grants it in one transaction on Monad, and one more transaction ends that access.

Live demo: [satchel-keys.vercel.app](https://satchel-keys.vercel.app). Registry on Monad testnet (10143): `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`.

```ts
import { openOrEnrol, ns } from "satchel-sdk";

// mode is read on a first visit only: "enrol" creates a passkey, "open" uses one the person already has
const s = await openOrEnrol({ rpId: location.hostname, appName: "My app", mode });
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });                 // Sealed, safe to store anywhere
const back = await s.unsealJson(memory, blob);                                // { likes: "metric units" }
```

```
npm i satchel-sdk @category-labs/mera@0.2.0
```

## Hand a second app a revocable grant

```ts
import { createGrantee, fetchGrant, ns } from "satchel-sdk";

// App B (another origin) keeps its own P-256 key. It never touches the passkey.
const appB = await createGrantee();

// App A, with the person's session: one transaction on Monad.
const memory = ns("memory/assistant");
const grant = await s.grant(memory, appB.publicKey, { label: "App B" });

// App B rebuilds the grant from the transaction hash alone and reads.
const g = await fetchGrant({ txHash: grant.txHash, registry: REGISTRY, ns: memory });
await appB.reader(g).unsealJson(blob);                                       // { likes: "metric units" }

// Revoke: the namespace moves to the next epoch for every reader.
await s.revoke(memory, grant.id);
const fresh = await s.seal(memory, { likes: "tea" });                        // sealed at epoch 2
await appB.reader(g).unseal(fresh);                                          // throws GRANT_REVOKED
```

Reseal what App B could already open after a revoke, and `regrant` any reader that should keep access.

## What you get

| Export | Does |
|---|---|
| `ns(path)` | A branded namespace. HKDF info is `satchel/ns/` plus the path. |
| `openOrEnrol(o)` | One passkey prompt per call. With a remembered credential it opens it (a gone passkey clears the memory and throws `PASSKEY_NOT_FOUND`); on a first visit it runs `mode: "open"` or `mode: "enrol"`, and throws `CHOOSE_PASSKEY_MODE` without a mode. Call it from the click of a "Create a passkey" or "I already have one" button. |
| `rememberedPasskey(o)` | The credential `openOrEnrol` remembers for this rpId, or `undefined` on a first visit: one button or two. |
| `enrol(o)` / `open(o)` | New passkey or existing passkey, one prompt, through Mera 0.2.0. |
| `fromPrfOutput(prf, o)` | The same session from a 32 byte PRF output you hold (tests, server-side readers). Takes ownership of the array and zeroes it on `close()`. |
| `Satchel.seal` / `unseal` / `unsealJson` | AES-256-GCM, per-epoch data key, header bound as AAD. |
| `Satchel.fingerprint(ns)` | 8 hex characters that match across devices. |
| `Satchel.addPasskey` | Wraps the root to a second passkey in your `Store`. |
| `Satchel.grant` / `regrant` / `revoke` | HPKE (RFC 9180, P-256) wrap of the epoch key to an app, recorded in the registry; waits for a successful receipt. `revoke` moves the namespace to the next epoch for every reader, and `regrant` issues the fresh grant a remaining reader needs. |
| `createGrantee()` | The reading app's own key. It never touches the passkey. |
| `fetchGrant({ txHash, registry })` | Reads the Granted event from the grant's transaction receipt, so a grant crosses origins as a tx hash. |
| `epochOf`, `nsHashOf`, `registryAbi` | Read the registry directly. |
| `parseSealed`, `SatchelError`, `isSatchelError` | Header inspection and errors that carry `code`, `fix` and `docs`. |

Sealed bytes: `SAT1 | version | nsHash (32) | epoch u64 | iv (12) | ciphertext`, AAD is the header.

## Registry

Pass `registry: { address }` in the open options for epochs, `grant` and `revoke`. The default chain is Monad testnet (10143); pass `chain` and `rpcUrl` for any other EVM chain. The registry owner is an EOA derived from the passkey (`session.registryOwner`), which pays gas for `grant`, `regrant` and `revoke`. Both throw `OWNER_UNFUNDED` with the address and the shortfall before sending when it cannot pay.

## Tests

Runner: `bun test` (Bun 1.3). `bun run test` runs unit tests, six fast-check properties and the registry tests against the real `SatchelRegistry` on a local anvil. `bun run mutation` breaks namespacing, the epoch source and the HPKE key handling in temp copies and confirms the matching properties go red, then green on the real tree. Results land in `test-results/`.
