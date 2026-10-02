# @satchel/sdk

One passkey, many namespaced keys. Seal data per app, hand a second app a revocable read grant, and cut it off with an epoch bump on Monad.

```ts
import { open, ns } from "@satchel/sdk";

const s = await open({ rpId: location.hostname });             // one passkey prompt
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });  // safe to store anywhere
const back = await s.unsealJson<{ likes: string }>(memory, blob);
```

```
npm i @satchel/sdk @category-labs/mera@0.2.0
```

## What you get

| Export | Does |
|---|---|
| `ns(path)` | A branded namespace. HKDF info is `satchel/ns/` plus the path. |
| `enrol(o)` / `open(o)` | New passkey or existing passkey, one prompt, through Mera 0.2.0. |
| `fromPrfOutput(prf, o)` | The same session from a 32 byte PRF output you hold (tests, server-side readers). Takes ownership of the array and zeroes it on `close()`. |
| `Satchel.seal` / `unseal` / `unsealJson` | AES-256-GCM, per-epoch data key, header bound as AAD. |
| `Satchel.fingerprint(ns)` | 8 hex characters that match across devices. |
| `Satchel.addPasskey` | Wraps the root to a second passkey in your `Store`. |
| `Satchel.grant` / `revoke` | HPKE (RFC 9180, P-256) wrap of the epoch key to an app, recorded in the registry; waits for a successful receipt. |
| `createGrantee()` | The reading app's own key. It never touches the passkey. |
| `parseSealed`, `SatchelError` | Header inspection and errors that carry `code`, `fix` and `docs`. |

Sealed bytes: `SAT1 | version | nsHash (32) | epoch u64 | iv (12) | ciphertext`, AAD is the header.

## Registry

Pass `registry: { address }` in the open options for epochs, `grant` and `revoke`. The default chain is Monad testnet (10143); pass `chain` and `rpcUrl` for any other EVM chain. The registry owner is an EOA derived from the passkey (`session.registryOwner`), which pays gas for `grant` and `revoke`.

## Tests

Runner: `bun test` (Bun 1.3). `bun run test` runs unit tests, six fast-check properties and the registry tests against the real `SatchelRegistry` on a local anvil. `bun run mutation` breaks namespacing, the epoch source and the HPKE key handling in temp copies and confirms the matching properties go red, then green on the real tree. Results land in `test-results/`.
