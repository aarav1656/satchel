// bun scripts/verify-assistant-onchain.ts <owner> <grantId> <grantTx> <revokeTx> <fernPublicKey> <regrantTx>
// Reads the registry on Monad testnet with viem, independently of the SDK, and asserts what the page claimed.
// The namespace hash is recomputed here from the documented info string, not taken from the page.
import fs from "node:fs";
import { createPublicClient, decodeEventLog, http, keccak256, parseAbi, toBytes, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";

const [owner, grantId, grantTx, revokeTx, fernKey, regrantTx] = process.argv.slice(2) as [Address, string, Hex, Hex, Hex, Hex];
if (!owner || !grantId || !grantTx || !revokeTx || !fernKey || !regrantTx) throw new Error("usage: bun scripts/verify-assistant-onchain.ts <owner> <grantId> <grantTx> <revokeTx> <fernPublicKey> <regrantTx>");
const dep = JSON.parse(fs.readFileSync(new URL("../../../deployments/testnet.json", import.meta.url), "utf8"));
const nsHash = keccak256(toBytes("satchel/ns/memory/assistant"));
const abi = parseAbi([
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grantOf(uint256 grantId) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);
const pub = createPublicClient({ chain: monadTestnet, transport: http(dep.rpc, { retryCount: 8, retryDelay: 800 }) });
const head = await pub.getBlockNumber();
const read = <T extends "epochOf" | "grantOf">(functionName: T, args: readonly unknown[]) =>
  pub.readContract({ address: dep.address, abi, functionName, args } as never) as Promise<any>;
// The public RPC rate-limits, so read one at a time with retry.
const g = await read("grantOf", [BigInt(grantId)]);
const epoch = await read("epochOf", [owner, nsHash]);
const gr = await pub.getTransactionReceipt({ hash: grantTx });
const rr = await pub.getTransactionReceipt({ hash: revokeTx });
const gr2 = await pub.getTransactionReceipt({ hash: regrantTx });
const regrantId = gr2.logs
  .filter((l) => l.address.toLowerCase() === dep.address.toLowerCase())
  .map((l) => {
    try {
      return decodeEventLog({ abi: parseAbi(["event Granted(address indexed owner, bytes32 indexed nsHash, uint256 indexed grantId, uint64 epoch, bytes32 granteeKeyHash, bytes wrappedKey, string label)"]), data: l.data, topics: l.topics });
    } catch {
      return undefined;
    }
  })
  .find((e) => e !== undefined)?.args.grantId;
const g2 = regrantId === undefined ? undefined : await read("grantOf", [regrantId]);
const checks: [string, boolean][] = [
  ["grant tx receipt status success, sent to the registry by the passkey-derived owner", gr.status === "success" && gr.to?.toLowerCase() === dep.address.toLowerCase() && gr.from.toLowerCase() === owner.toLowerCase()],
  ["revoke tx receipt status success, sent to the registry by the owner", rr.status === "success" && rr.to?.toLowerCase() === dep.address.toLowerCase() && rr.from.toLowerCase() === owner.toLowerCase()],
  ["grantOf.owner is the owner and grantOf.nsHash is keccak256(satchel/ns/memory/assistant)", g[0].toLowerCase() === owner.toLowerCase() && g[1] === nsHash],
  ["grantOf.epoch is 1 and granteeKeyHash is keccak256 of Fern's public key", Number(g[2]) === 1 && g[3] === keccak256(fernKey)],
  ["grantOf.active is false after the revoke", g[4] === false],
  ["epochOf(owner, memory/assistant) is at least 2 after the revoke", Number(epoch) >= 2],
  ["revoke mined after grant", rr.blockNumber >= gr.blockNumber],
  ["regrant tx receipt status success, sent to the registry by the owner", gr2.status === "success" && gr2.to?.toLowerCase() === dep.address.toLowerCase() && gr2.from.toLowerCase() === owner.toLowerCase()],
  ["regrant mined after the revoke", gr2.blockNumber >= rr.blockNumber],
  ["regrant is a new grant id, active, at epoch 2, for Fern's key", g2 !== undefined && String(regrantId) !== grantId && g2[4] === true && Number(g2[2]) === 2 && g2[3] === keccak256(fernKey)],
  ["the first grant stays inactive after the regrant", g[4] === false],
];
console.log(`registry=${dep.address} chain=10143 read_at_block=${head} grant_block=${gr.blockNumber} revoke_block=${rr.blockNumber} regrant_block=${gr2.blockNumber}`);
console.log(`grant tx ${grantTx} status=${gr.status} id=${grantId}`);
console.log(`revoke tx ${revokeTx} status=${rr.status}`);
console.log(`regrant tx ${regrantTx} status=${gr2.status} id=${regrantId}`);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
