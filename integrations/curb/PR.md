# Create and sign in with one passkey prompt

Replaces `web/src/lib/passkey/keys.ts`. One file changes. `KeyRole`, `CurbAccountRecord`, `createAccount`, `signIn`, `withOwnerKey`, `openTradingSession` and `TradingSession` keep their names and signatures, so the onboarding screen, `lazy.ts`, the hooks and the account card compile unchanged. No new dependency.

## What changes

`createAccount` and `signIn` ask the passkey once instead of twice. The WebAuthn PRF extension can evaluate two salts in the same ceremony (`eval.first` and `eval.second`), and each output is the same bytes it would be on its own. Curb's owner salt and trading salt now travel together: one Face ID, two outputs, the same Mera recipe (PRF output, BIP-39, `m/44'/60'/0'/0/0`) applied to each.

`withOwnerKey` and `openTradingSession` do not change. Each still asks for one prompt and still derives only its own role, so the trading session in a tab never holds owner key material. Both role outputs exist in memory together only inside `createAccount` and `signIn`, where they already did.

## Keys: every address stays the same

The salts (`curb.owner.v1`, `curb.trade.v1`) and the key recipe are untouched, so an account created before this change signs in to the same owner and trading addresses, and an account created after it signs in the same way on the old code. No version flag and no migration are needed, and no stored record changes shape. The run below checks this in both directions on real passkeys.

## One prompt on every authenticator, and the one that is not

If an authenticator answers only the first salt, `createAccount` and `signIn` run the second prompt that main runs today and produce the same keys. An account is never created with one role missing.

## How to test it

1. `git apply 0001-*.patch` on `main`, then `cd web && npm run typecheck && npm run build`.
2. In Chrome with a passkey that supports PRF, open Start, create an account: one prompt. Clear site data, choose "I already have a passkey": one prompt, the same two addresses as before.
3. The harness used for the numbers below is in the satchel repo under `integrations/curb/harness`. `run.sh` bundles this repo's real `keys.ts` and the one on `main`, drives both in a browser against a virtual passkey authenticator with PRF, and `check.mjs` asserts the claims from the recorded results.
4. `docs/DECISIONS.md` D-012 still says "Creating an account costs two biometric prompts; signing in costs two". That line becomes "one" with this patch.

## Numbers from the run

WebAuthn PRF ceremonies in a browser against a virtual platform authenticator (ctap2, internal, resident key, user verification, PRF). The page counts every call to `navigator.credentials.create` and `get`. No transaction is sent.

| | `main` | patched |
|---|---|---|
| prompts to create an account (both addresses) | 2 | 1 |
| prompts to sign in on a device with no record (both addresses) | 2 | 1 |
| prompts for an owner key action (`withOwnerKey`) | 1 | 1 |
| prompts to unlock the trading key (`openTradingSession`) | 1 | 1 |

- A passkey made by the patch: `main`'s `signIn` returns the same owner and trading addresses (2 prompts). A passkey made by `main`: the patch's `signIn` returns `main`'s addresses (1 prompt). `main`'s `withOwnerKey` and `openTradingSession` accept the patched record, and the patched ones accept a record made by `main`.
- After a fresh page load the patched `signIn` returns the same two addresses with one prompt.
- A second passkey produced different owner and trading addresses, and within one passkey owner and trading differ.
- With the second output discarded inside the patched file, the same run needed 2 prompts for create and for sign in and returned the same addresses, so the count of 1 comes from the two-salt request and the counter is able to fail.
- `npm run typecheck`, `npm run lint` with `--max-warnings 0`, `npm test` and `npm run build` pass on `main` and with the patch. A deliberate type error in the file fails typecheck with TS2322.
- `git apply --check` on a fresh worktree of `main` (14d5af3) passes. `check.mjs` holds 19 of 19 claims on the recorded run, and 18 of 19 when one recorded prompt count is edited to 2.
