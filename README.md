# satchel

One passkey, many namespaced keys. An app seals its data under its own namespace with one passkey prompt, hands a second app a read grant, and takes it back with an epoch bump on Monad. No secret is stored anywhere: only ciphertext leaves the tab.

Live: https://satchel-keys.vercel.app (Monad testnet, chain 10143). Registry: `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`.

```sh
npm i https://satchel-keys.vercel.app/satchel-sdk-0.1.0.tgz @category-labs/mera@0.2.0
```

```js
import { openOrEnrol, ns } from "satchel-sdk";

const mode = "enrol"; // "open" when this person already has a passkey
const s = await openOrEnrol({ rpId: location.hostname, appName: "My app", mode });
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" });   // Sealed, safe to store anywhere
const back = await s.unsealJson(memory, blob);                  // { likes: "metric units" }
```

## What it does

- `derive`: HKDF namespaces from the passkey's PRF output. One prompt yields any number of isolated keys; a namespace's fingerprint is the same on every device that holds the passkey.
- `seal` / `unseal`: AES-256-GCM, a per-epoch data key, the header bound as authenticated data. A different passkey fails closed with `WRONG_PASSKEY`, a different namespace with `NAMESPACE_MISMATCH`.
- `grant` / `fetchGrant`: an HPKE (RFC 9180, P-256) wrap of the epoch key to another app's own key, recorded in `SatchelRegistry` on Monad. The reading app rebuilds the grant from the transaction hash alone.
- `revoke` / `regrant`: revoke moves the namespace to the next epoch for every reader; new records are sealed at epoch 2 and the revoked app gets `GRANT_REVOKED` on them while the owner's other namespaces stay at epoch 1.
- `addPasskey`: a second passkey opens the same namespaces.

The flagship use is cross-application AI memory: an assistant's memory sealed in one namespace and read by a second app under a revocable grant.

## Proof

Every row names the command that produced it. Chain facts are read with viem or `cast` against the Monad testnet RPC, not through the SDK.

| Claim | Evidence |
|---|---|
| A developer installs from the packed tarball into an empty project and runs derive, seal, unseal, grant, fetchGrant, revoke, regrant against the testnet registry | `devflow/run.sh`: `DEVFLOW PASS 6 steps`, grant 23 tx `0x66748ea0d7cf30a37e8e765ca85d051f876738fa5b5828fdb8a60e79307e2c6d`, revoke tx `0x7b238eacc84182b9a5d93cbaa0b567cd5e951a63ac8d63d15d46d6d77f75e160` read back as epoch 1 to 2, regrant tx `0xa5cc64daaa674df025efd95c18ca97327482140a3b4839fd48a7fd96e41d03a3`; goes red when the namespace check is removed (`devflow/results/mutation-red.txt`) |
| The install line and the Node quickstart copied off the live page print `{"likes":"metric units"}` | `devflow/quickstart.sh`: `QUICKSTART PASS`, the tarball URL answers 200 |
| The browser quickstart, Pip and Fern run on the live site with real input, a virtual authenticator with PRF, and every receipt read back from chain | `apps/web/scripts/click-through.sh`, results in `apps/web/results/`; independent viem read passes 18 checks |
| The first-run paths hold: Create, remembered passkey, stale marker to `PASSKEY_NOT_FOUND`, recovery | `apps/web/scripts/first-run.sh`, scenarios a, b, c on the live origin |
| `SatchelRegistry` holds under fuzzing | 22 Foundry tests including 3 invariants, 6 of 6 mutants killed (`contracts/results/`) |
| The SDK holds | 89 tests including 6 fast-check properties; mutation run breaks namespacing, the epoch source and HPKE key handling and goes red each time (`packages/sdk/test-results/`) |
| The docs cannot drift from the code | `apps/web/scripts/check-built.mjs` fails the build when the displayed quickstart, the install line, the Node quickstart, the 43 SDK names or the 19 error codes differ from the code; 13 routes and 450 internal links answer 200 on the live site |
| Other teams' code takes satchel with one file | `integrations/`: patches against Curb, trustset and Firsthand, each with a harness that runs real WebAuthn PRF ceremonies and a mutant control that goes red |

## Layout

- `packages/sdk`: the SDK (`satchel-sdk`).
- `contracts`: `SatchelRegistry` and its tests.
- `apps/web`: the docs site and the Pip and Fern demo apps, a static export.
- `devflow`: the developer path from the packed tarball.
- `integrations`: patches and harnesses for other teams' repos.
- `docs/try-it.md`: the three steps a first-time developer follows.
