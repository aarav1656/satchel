# Satchel next to the locker: one passkey tap, no locker key moves

Adds one file, `packages/sdk/src/webauthn/satchel.ts`. No existing file changes. `KeyTree`, `WebAuthnPrfSource`, `PRF_EVAL_SALT`, `KDF_SALT` and every `info` string are untouched, so every key Firsthand derives today is byte for byte the key it derives after this patch.

This answers two items on the help list in `docs/PROGRESS.md`: "Passkey PRF (Mera or equivalent)" and "Integration partners".

## Why an adapter and not a replacement

The derivation in README 7.3 is the identity: the principal commitment is the hash of `k_id`'s public key, the deposit origins are the addresses of `k_dep(ns,e)`, and every envelope is wrapped under `k_ns,e`. Swapping the key tree for satchel's would change all three for every holder, so this patch does not touch it.

Firsthand already does what satchel's session is known for. One fixed PRF salt gives the whole tree, so unlocking the locker is one tap. Putting satchel beside it the plain way costs a second tap, because `satchel-sdk`'s `open()` asks the passkey for its own PRF salt. Measured below: 2 taps instead of 1. The adapter takes the second tap away.

## What it exports

| Name | Does |
|---|---|
| `openWithSatchel(source, options)` | One `source.evaluate(PRF_EVAL_SALT)`. Builds the `KeyTree` exactly as `KeyTree.fromSource` does and a satchel session from the same evaluation. Returns `{ keys, satchel, dispose() }`. |
| `firsthandNs(index)` | The satchel namespace `firsthand/ns/<index>` for locker namespace 0 to 15. |
| `MeraPrfSource` | A `PrfSource` over Mera's `getPasskeyPrfOutput`. Mera takes the salt as an argument, so Firsthand's salt goes through and the passkey returns the same 32 bytes as `WebAuthnPrfSource`. |

`openWithSatchel` takes any `PrfSource`, so `WebAuthnPrfSource` works as it is and `MeraPrfSource` is optional.

## What the holder gets on that one tap

A satchel session next to the locker: `seal` and `unseal` under per-namespace, per-epoch keys, a header-bound blob (`SAT1`, namespace hash, epoch, nonce, AES-256-GCM), and satchel's registry on Monad for read grants to an app that holds its own P-256 key, cut off by an epoch bump. Use it for whatever an app wants sealed under the holder's passkey that is not a passport envelope, and for handing a reader app revocable access. The passport envelope, `GrantManager` and rescission stay as they are.

This run sends no transactions, so registry grants and revocation are satchel's own and are not re-measured here.

## Key compatibility

Same passkey, same page, five values compared: the principal commitment (from `k_id`), the deposit address of `k_dep(0,1)`, and one-way fingerprints of `k_ns(0,1)`, `k_ns(1,7)` and `k_nonce(1,7)`.

| Path | Equal to `KeyTree.fromSource(WebAuthnPrfSource)` |
|---|---|
| `openWithSatchel(WebAuthnPrfSource)` | 5 of 5 |
| `openWithSatchel(MeraPrfSource)` | 5 of 5 |
| fresh page load, same passkey | 5 of 5, and a blob sealed before the reload opens |
| Mera with its own default salt (control) | 0 of 5, so the comparison can fail |
| adapter with its key tree built from the wrong root (mutant) | 0 of 5 |
| a second passkey | 0 of 5, and it cannot open the first passkey's blob (`WRONG_PASSKEY`) |

No private bytes are printed. The harness log carries public values and 8 hex character SHA-256 fingerprints only.

## Domain separation

The satchel root is not the PRF output. It is `HKDF-SHA256(prf, salt "FIRSTHAND/satchel-root/v1", info "root")`. A satchel grantee, a blob, or a second passkey added through `Satchel.addPasskey()` can reach the satchel root and nothing above it, so none of them can reach a locker key, and the locker's derivation never reads the satchel root. Measured: satchel's registry owner address equals none of the 16 deposit addresses of epoch 1.

## Passkey prompts

Counted as resolved calls to `navigator.credentials.get` in the page, against a virtual authenticator with PRF.

| | taps |
|---|---|
| Firsthand unlock, as it is | 1 |
| Firsthand unlock, then `satchel-sdk` `open()` beside it | 2 |
| `openWithSatchel`, then 3 seals, 3 opens, 2 refused opens | 1 |
| `openWithSatchel(MeraPrfSource)` | 1 |
| fresh page load, then open a blob sealed before it | 1 |

A blob sealed under `firsthand/ns/0` opened as `firsthand/ns/1` fails with `NAMESPACE_MISMATCH`. The same blob with its header relabelled to ns/1 fails with `WRONG_PASSKEY`, because the header is authenticated data and the key differs. Blobs are 127, 119 and 126 bytes for texts of 54, 46 and 53 bytes plus the 73 byte frame.

## Mera

Mera 0.2.0 exposes the WebAuthn PRF extension with a caller-chosen salt. With `PRF_EVAL_SALT` it returns the output `WebAuthnPrfSource` returns (table above), so Firsthand can keep its derivation and use Mera's ceremony. Which mobile providers return PRF is a separate question this run did not measure: the harness ran Chrome's virtual authenticator. The list `satchel-sdk` gives in its `PRF_UNAVAILABLE` error is iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass and YubiKey 5.

## How to test it

1. Add `satchel-sdk` and `@category-labs/mera@0.2.0` to `packages/sdk` as optional peer dependencies and as dev dependencies, add `src/webauthn/satchel.ts` to the entries in `packages/sdk/tsup.config.ts`, and add a `./satchel` subpath export. That is the whole wiring, and `pnpm check:deps` is unaffected because it reads `dependencies` only. `satchel-sdk` 0.1.0 is `packages/sdk` in `github.com/aarav1656/satchel`; the numbers here used its packed tarball. The wiring used for the run is in `local-proof/`.
2. `pnpm --filter @firsthand/sdk typecheck` and `pnpm --filter @firsthand/sdk build`.
3. `harness/run.sh` starts a static server, opens a pinned browser tab with a virtual authenticator that supports PRF, and drives the file through both runs above. It needs `bun` and a browser reachable over CDP.

## Checks

- `pnpm --filter @firsthand/sdk typecheck`: exit 0. With `const __mut: number = "x";` appended to the file: TS2322, exit 2. Restored: exit 0.
- `pnpm --filter @firsthand/sdk build` with the wiring: exit 0, `dist/webauthn/satchel.{js,cjs,d.ts}` emitted. With the same injected error: the declaration build fails. Without the wiring the build output is identical to main, because the file is not an entry.
- `@firsthand/crypto` tests: 48 passed. `@firsthand/sdk` unit tests: 38 passed. `biome ci packages/sdk` and `node scripts/check-deps.mjs`: clean.
- Not run: the repo's `pnpm coverage` and `forge` gates, which this change cannot reach.
