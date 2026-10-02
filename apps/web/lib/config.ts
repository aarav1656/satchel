import type { Registry } from "@satchel/sdk";

/** The deployed epoch registry (deployments/testnet.json). Chain 10143, Monad testnet. */
export const REGISTRY_ADDRESS = "0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d" as const;
export const REGISTRY: Registry = { address: REGISTRY_ADDRESS };
export const MEMORY_NS = "memory/assistant";
export const NOTES_NS = "memory/notes";
export const SUGGESTED_MEMORY = "Prefers metric units, writes in short sentences";
export const MIN_OWNER_BALANCE_WEI = 20_000_000_000_000_000n; // 0.02 MON covers a grant (137k gas) and a revoke (78k gas) with headroom
