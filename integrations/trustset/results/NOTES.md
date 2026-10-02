Working notes, 2026-10-02.

- Namespace is per agent (trustset/notes/<agentId>), so openNote, which is handed only the vault, gets the agent id from readNotes: the vault field of a satchel note is { satchel, agentId }. Sealed.vault therefore widens from PasskeySecretVault to a union; Runbook.tsx only tests it for truthiness.
- Detection of old vs new is the first four bytes (SAT1). Mera vault JSON starts with "{".
- Wrong passkey: satchel opens a session with any passkey and only the unseal fails (WRONG_PASSKEY). The cached session would then be wrong until reload, so openNote drops it on that code. Verified in run 2: second try prompts again.
- Dependency: file dependency on the packed SDK tarball (npm pack of packages/sdk, 0.1.0, sha256 prefix d14d0d3beac3d2b3) at /tmp/satchel-pack. Kept as a separate local commit, local-proof/0002-*.patch. The PR patch is 0001 only.
- Commits in /tmp/trustset are authored as aarav1656; the global pre-commit identity guard refused it and was passed with its documented ALLOW_ALT_IDENTITY=1 for each commit.
- Harness hit two plumbing issues, both in the harness and not the module: ethers nonce caching on anvil (fixed with NonceManager) and WebAuthn focus refusal (retry, as in test-rig; it inflates the "create" count in runs 1 and 4, never the "get" count).
- Blind spots: the page is a harness, not trustset's Runbook UI, and trustset's own browser e2e suite was not run (this machine forbids its runner). Prompt counts are calls to navigator.credentials.get against a virtual authenticator, not visible OS dialogs. Chain is a local anvil, not Monad. The mapped messages NAMESPACE_MISMATCH, SEAL_CORRUPT, RPID_MISMATCH, SESSION_CLOSED, PRF_UNAVAILABLE are checked by results/explainseal.log (construct error, read text), not by a ceremony.
