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
