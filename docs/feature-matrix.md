# Published SDK developer flow

Run date: 2026-10-08. Consumer: `satchel-sdk@0.1.0` installed from the npm registry with Mera 0.2.0. Chain: Monad testnet, 10143. Registry: `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`.

| Capability | Command or entry point | Observed postcondition | Evidence |
|---|---|---|---|
| Registry installation | `bash devflow/run.sh` | Lock resolves the published 0.1.0 registry tarball with SHA-512 integrity; installed manifest matches | `devflow/results/devflow-2026-10-08.txt` |
| Consumer types | Runner's strict `tsc --noEmit` check | Installed declarations compile; plain-string namespace is rejected by the expected type error | Same run |
| Derive | Runner, derive step | Two namespaces have distinct fingerprints; reopening the same persisted PRF preserves fingerprint | Same run |
| Seal and reopen | Runner, seal/unseal step | Plaintext matches; wrong namespace, changed ciphertext, truncated data and wrong passkey are refused | Same run |
| Unfunded owner | Runner, owner-unfunded step | `OWNER_UNFUNDED` before submission; independent native balance is zero | Same run |
| Grant | Runner, grant step | Successful receipt; independent `grantOf` matches owner, namespace, epoch, reader and active state; reader opens epoch-1 memory | Grant 31, `0x79c954b7c758c931aa4e358de93621e005a4e439700fb2ac513a1c43ce18f42d` |
| Revoke | Runner, revoke step | Successful receipt; old grant inactive; namespace advances to epoch 2; other namespace remains epoch 1 | `0x35130c033871d413245f93df0c71e59fbba964d3cf323f3ee686656e5b60e9ad` |
| Revoked reader refusal | Runner, revoke step and isolated mutation run | Old reader retains old memory but receives `GRANT_REVOKED` on new memory; removing guard makes the check fail | `devflow/results/mutation-2026-10-08.txt` |
| Regrant | Runner, regrant step | Successful receipt; new grant reads epoch-2 memory; SDK epoch agrees with independent chain read | Grant 32, `0xeffe94c2e52521c78a830fafaa7f40a32edfbcafdf3840ca9ecb70864c92b6e7` |
| Registry source refusal | `node --test devflow/registry-source.test.mjs` | 8 checks pass; file source, wrong version and missing integrity are refused; removing URL guard fails 2 checks | Mutation evidence |
| Live quickstart and stale credential recovery | Deployed quickstart, actual buttons through Brave at 390x844 | One prompt seals/reopens; stale credential is forgotten; create/open choices return; recreation and repeat run succeed with stable fingerprint and no horizontal overflow | Mutation evidence, production-browser section |

The runner waits for receipts with a bounded timeout and reads the registry independently of the SDK. The npm lock check and revoked-reader check both have recorded red and restored-green runs.

# Assistant loop: Pip and Fern

Run date: 2026-10-13. Origin: https://satchel-keys.vercel.app (production), one pinned deepsurge tab, a virtual passkey authenticator with PRF. Chain: Monad testnet, 10143. Registry: `0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d`. Owner of the run: `0x01aE841b6Fd5Ca5Df456974A26De7B8202c88dd2`.

| Capability | Command or entry point | Observed postcondition | Evidence |
|---|---|---|---|
| Product front door | `/` | The first screen is "Your assistant's memory, sealed to your passkey." with Pip and Fern side by side; the docs quickstart is at `/docs/`; `check-built` fails if `/` loses a link to `/pip/`, `/fern/` or `/docs/`, or regains the quickstart block | `apps/web/scripts/check-built.mjs`, `apps/web/results/assistant-live-2026-10-13.txt` |
| Chat function | `POST /api/chat`, `anthropic/claude-haiku-4.5` through AI Gateway with the project's OIDC token | A foreign origin gets 403, a malformed body 400, an oversized body 413; a valid request reaches AI Gateway and its answer or rejection is returned as JSON and shown in the page | `api/chat.ts`, `api/_chat-input.ts` |
| Pip seals each fact the model's `remember` tool call returns | Pip chat | Two statements produce two rows in "What Pip remembers", each with epoch, size, fingerprint and a SAT1 ciphertext; `localStorage` holds no fact in clear | `MEMORIES e1 "Vegetarian" ... fp 1df922ee`, `STORAGE 2 rows, plaintext present: false` in the live run |
| Memories never reach storage unsealed | `bun test lib/memory.test.ts` | The recording store sees ciphertext only; a sealer that skips encryption turns the same check red | `apps/web/lib/memory.test.ts` |
| Plaintext goes to the model from the owner's browser only | Live run, request bodies recorded in the page | Pip's first request carries no memories, its second carries only `Vegetarian`; Fern's request carries the two memories it opened | `ASSERT Pip hands the model only what it had unsealed so far`, `ASSERT Fern handed the model the two memories it opened` |
| Grant | Fern, Connect, Allow | Receipt `success`, `grantOf(37)` active at epoch 1 for Fern's key; Fern opens 2 of 2 memories and the plan uses both facts | Grant 37, `0x1ef48ed075c60b6046372bf24d616f8f7af8e4d2fffc62025cf6d4d0eb737116`, block 70656985 |
| Revoke and reseal | Pip, Sharing, Revoke Fern | Receipt `success`, `grantOf(37)` inactive, `epochOf` is 2; Pip reports "sealed 2 memories again at epoch 2" and every row reads `e2` | `0xcdf08e19626ef9f1c1bb68722b1a65edb8f68ae9f9ef2af3e91d5c6205bc0d6b`, block 70657023 |
| Fern forgets | Fern chat after the revoke | Every memory is locked `GRANT_REVOKED`, the read is 0 of 2 opened, the request to the model carries no memories, the answer does not use them | `FERN after revoke: I cannot see any memories ...` |
| Revoke without the reseal is caught | `bun test lib/memory-e2e.test.ts` | Before the reseal, Fern's epoch-1 grant still opens the epoch-1 ciphertext; after it, all rows are `GRANT_REVOKED`; removing the replace step turns the test red | `apps/web/lib/memory-e2e.test.ts` |
| Regrant | Fern, Ask Pip for a new grant | New grant id 38 active at epoch 2; Fern opens both memories again | `0x2527b5a521cdb9dcb526262a4e3b982442c5f272d0c1962f9e7ff72a449b5b5c`, block 70657064 |
| Independent chain read | `bun scripts/verify-assistant-onchain.ts`, `cast receipt`, `cast call grantOf` | 11 checks pass; `cast` agrees: all three receipts `true`, `grantOf(37)` false, `grantOf(38)` true at epoch 2, `epochOf` 2 | `apps/web/results/assistant-onchain-live-2026-10-13.txt` |
| Mobile layout | `steps-assistant-mobile.mjs` at 390x844 | No sideways scroll on `/`, `/pip/` with memories or `/fern/`; the apps stack with a vertical grant line | `apps/web/results/assistant-mobile-390x844-2026-10-13.txt` |

The browser run drives the page's own request path with the chat response supplied by the harness and records every request body the page sends, so the sealing, the two transactions, the reseal and the reads are the product's own code against the live registry. The live endpoint is probed first in the same run and its response is logged on the `ENDPOINT` line.
