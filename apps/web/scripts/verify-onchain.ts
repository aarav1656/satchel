// bun scripts/verify-onchain.ts <owner> <grantId> <grantTx> <revokeTx> <fernPublicKey> <regrantId> <regrantTx>
// Reads the registry on Monad testnet with viem, independently of the SDK, and asserts what the page claimed.
// The namespace hash is recomputed here from the documented info string, not taken from the page.
import fs from "node:fs";
import { createPublicClient, http, keccak256, parseAbi, toBytes, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";

const [owner, grantId, grantTx, revokeTx, fernKey, regrantId, regrantTx] = process.argv.slice(2) as [Address, string, Hex, Hex, Hex, string, Hex];
if (!owner || !grantId || !grantTx || !revokeTx || !fernKey || !regrantId || !regrantTx) throw new Error("usage: bun scripts/verify-onchain.ts <owner> <grantId> <grantTx> <revokeTx> <fernPublicKey> <regrantId> <regrantTx>");
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
// The public RPC allows 15 requests a second across everyone on this address, so read one at a time with retry.
const g = await read("grantOf", [BigInt(grantId)]);
const epoch = await read("epochOf", [owner, nsHash]);
const other = await read("epochOf", [owner, keccak256(toBytes("satchel/ns/memory/notes"))]);
const gr = await pub.getTransactionReceipt({ hash: grantTx });
const rr = await pub.getTransactionReceipt({ hash: revokeTx });
const g2 = await read("grantOf", [BigInt(regrantId)]);
const gr2 = await pub.getTransactionReceipt({ hash: regrantTx });
const checks: [string, boolean][] = [
  ["grant tx receipt status success, sent to the registry", gr.status === "success" && gr.to?.toLowerCase() === dep.address.toLowerCase()],
  ["revoke tx receipt status success, sent to the registry", rr.status === "success" && rr.to?.toLowerCase() === dep.address.toLowerCase()],
  ["both txs sent by the passkey-derived owner", gr.from.toLowerCase() === owner.toLowerCase() && rr.from.toLowerCase() === owner.toLowerCase()],
  ["grantOf.owner is the passkey-derived owner", g[0].toLowerCase() === owner.toLowerCase()],
  ["grantOf.nsHash is keccak256(satchel/ns/memory/assistant)", g[1] === nsHash],
  ["grantOf.epoch is 1", Number(g[2]) === 1],
  ["grantOf.granteeKeyHash is keccak256 of Fern's public key", g[3] === keccak256(fernKey)],
  ["grantOf.active is false after revoke", g[4] === false],
  ["epochOf(owner, memory/assistant) is 2", Number(epoch) === 2],
  ["an untouched namespace of the same owner (memory/notes) is still epoch 1", Number(other) === 1],
  ["revoke mined after grant", rr.blockNumber >= gr.blockNumber],
  ["regrant tx receipt status success, sent to the registry by the owner", gr2.status === "success" && gr2.to?.toLowerCase() === dep.address.toLowerCase() && gr2.from.toLowerCase() === owner.toLowerCase()],
  ["regrant mined after revoke", gr2.blockNumber >= rr.blockNumber],
  ["regrant is a new grant id, not the revoked one", regrantId !== grantId],
  ["grantOf(regrant).owner is the passkey-derived owner and its nsHash is memory/assistant", g2[0].toLowerCase() === owner.toLowerCase() && g2[1] === nsHash],
  ["grantOf(regrant).epoch is 2 and it is active", Number(g2[2]) === 2 && g2[4] === true],
  ["grantOf(regrant).granteeKeyHash is keccak256 of Fern's public key", g2[3] === keccak256(fernKey)],
  ["the first grant stays inactive after the regrant", g[4] === false],
];
console.log(`registry=${dep.address} chain=10143 read_at_block=${head} grant_block=${gr.blockNumber} revoke_block=${rr.blockNumber}`);
console.log(`grant tx ${grantTx} status=${gr.status}`);
console.log(`revoke tx ${revokeTx} status=${rr.status}`);
console.log(`regrant tx ${regrantTx} status=${gr2.status} grant_id=${regrantId} block=${gr2.blockNumber}`);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
