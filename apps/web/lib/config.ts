import type { Registry } from "satchel-sdk";

/** The deployed epoch registry (deployments/testnet.json). Chain 10143, Monad testnet. */
export const REGISTRY_ADDRESS = "0xd6c895f5c9254dc6eaafc335fff0930fd7012e6d" as const;
export const REGISTRY: Registry = { address: REGISTRY_ADDRESS };
/** Cross-app AI memory for trading context (Track 04 idea 04). */
export const MEMORY_NS = "memory/trading-desk";
export const NOTES_NS = "memory/notes";
export const PIP_SUGGESTIONS = ["I'm vegetarian and I fly out of BLR.", "What should I pack for a weekend away?"];
export const FERN_SUGGESTIONS = ["Plan my weekend.", "Where should I eat on Saturday?"];
/** When set at build time, Pip publishes sealed notes here and Fern reads them (two origins, one passkey on Pip). */
export const NOTE_BUS_URL = (process.env.NEXT_PUBLIC_NOTE_BUS ?? "").replace(/\/$/, "");
/** App A origin for grant approval when App B runs on another port (e.g. http://127.0.0.1:5190). */
export const SEALER_ORIGIN = (process.env.NEXT_PUBLIC_SEALER_ORIGIN ?? "").replace(/\/$/, "");
export const MIN_OWNER_BALANCE_WEI = 20_000_000_000_000_000n; // 0.02 MON covers a grant (137k gas) and a revoke (78k gas) with headroom
/** The chat function. Same origin on the deployed site; set at build time to point a locally served export at a running function. */
export const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL ?? "/api/chat";
