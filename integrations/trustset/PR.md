# Seal notes once per session with satchel

Replaces `web/src/lib/sealed.ts`. One file changes. `NOTES_ABI`, `Kind`, `Sealed`, `readNotes`, `sealNote`, `openNote` and `explainSeal` keep their names and signatures, so `Runbook.tsx` and every other caller compile unchanged. The contract call is the same `seal(agentId, kind, bytes)`.

## What changes

New notes are sealed with the satchel SDK under the namespace `trustset/notes/<agentId>`. The passkey is asked once, when the first note is sealed or opened. After that, sealing more notes and opening any note for that session need no further prompt. The session key is held in memory, zeroed when the page is left, and dropped if the passkey that opened it turns out to be the wrong one, so the next attempt asks again.

The stored bytes are a satchel blob: `SAT1`, a version, the namespace hash, the epoch, a 12 byte nonce and the AES-256-GCM ciphertext, with the header bound as authenticated data. They go on chain in the existing `bytes vault` field.

## Why one prompt instead of one per note

Today every note is sealed under its own fresh salt, and a fresh salt means a fresh PRF evaluation, so a fresh passkey prompt. Sealing three notes and reading them back is six prompts. Under satchel the passkey yields one root secret per session, and each agent's notes get their own derived keys from it, so the keys stay separate per agent while the prompts do not multiply. An owner reading a runbook at three in the morning touches the passkey once.

## Notes already on chain

Notes sealed as Mera vault JSON still open. `readNotes` looks at the first four bytes: `SAT1` is a satchel note, anything else goes through the old `parseSecretVault` path. `openNote` sends each to the matching decryptor. An old note still costs one prompt to open, since its key is tied to its own salt. Nothing needs re-sealing and nothing is migrated.

A browser tab still running the previous bundle shows a new note as "Stored in a format this page cannot read" until it reloads.

## Error text

`explainSeal` keeps its three existing sentences and adds the satchel cases in the same voice: wrong passkey, no passkey or prompt closed, a passkey made for another address, a note that belongs to a different agent, a damaged note, an ended session. Mera errors from the old path map to the same sentences.

## How to test it

1. Add `@satchel/sdk` to `web/package.json` and install.
2. `cd web && npm run typecheck && npm run build`.
3. In the console, seal two runbooks for one agent and open both: one passkey prompt in total. Reload, open both again: one prompt. Open a note sealed before this change: it opens, with its own prompt.
4. The harness used for the numbers below is in the satchel repo under `integrations/trustset/harness`. `run.sh` starts an anvil, deploys this repo's `KillSwitch` and `SealedNotes`, and drives the patched module in a browser against a virtual passkey authenticator that supports PRF.

## Numbers from the run

WebAuthn PRF ceremony in the browser against a virtual authenticator. The page counts every call to `navigator.credentials.get`. Local anvil with this repo's contracts.

| | unpatched `sealed.ts` | patched |
|---|---|---|
| passkey prompts to seal 3 notes and open all 3, one session | 6 | 1 |
| passkey prompts to open 3 notes after a fresh page load | 3 | 1 |
| bytes on chain for the same three texts | 268, 271, 275 | 117, 119, 122 |

- A note sealed by the unpatched module in the same run opened through the patched `openNote`: plaintext matched, one prompt.
- A second, different passkey tried the same notes: `WRONG_PASSKEY`, shown as "That passkey is not the one this note was sealed with." Trying again asked for the passkey again.
- With the session cache removed from the patched file, the same run needed 6 prompts, so the count of 1 comes from the cache and the counter is able to fail.
- `npm run typecheck` and `npm run build` pass. A deliberate type error in the file fails typecheck with TS2322.
- The client JavaScript across all routes goes from 3,391,644 to 3,903,874 bytes (940,813 to 1,094,383 gzipped), from the SDK and its HPKE dependency. `viem` was already a dependency; its resolved version moves from 2.56.8 to 2.57.2.
