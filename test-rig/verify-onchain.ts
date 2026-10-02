// bun verify-onchain.ts <owner> <grantId> <grantTx> <revokeTx> <nsHash>
// Reads the registry on Monad testnet independently of the SDK and asserts what the page claimed.
import fs from "node:fs";
import { createPublicClient, http, keccak256, parseAbi, toBytes, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";

const [owner, grantId, grantTx, revokeTx, nsHash] = process.argv.slice(2) as [Address, string, Hex, Hex, Hex];
const dep = JSON.parse(fs.readFileSync(new URL("../deployments/testnet.json", import.meta.url), "utf8"));
const abi = parseAbi([
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grantOf(uint256 grantId) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);
const pub = createPublicClient({ chain: monadTestnet, transport: http(dep.rpc) });
const head = await pub.getBlockNumber();
const read = <T extends "epochOf" | "grantOf">(functionName: T, args: readonly unknown[]) =>
  pub.readContract({ address: dep.address, abi, functionName, args } as never) as Promise<any>;
const [g, epoch, other, gr, rr] = await Promise.all([
  read("grantOf", [BigInt(grantId)]),
  read("epochOf", [owner, nsHash]),
  read("epochOf", [owner, keccak256(toBytes("satchel/ns/memory/other-untouched"))]),
  pub.getTransactionReceipt({ hash: grantTx }),
  pub.getTransactionReceipt({ hash: revokeTx }),
]);
const checks: [string, boolean][] = [
  ["grant tx status success, to registry", gr.status === "success" && gr.to?.toLowerCase() === dep.address.toLowerCase()],
  ["revoke tx status success, to registry", rr.status === "success" && rr.to?.toLowerCase() === dep.address.toLowerCase()],
  ["both txs sent by the passkey-derived owner", gr.from.toLowerCase() === owner.toLowerCase() && rr.from.toLowerCase() === owner.toLowerCase()],
  ["grantOf.owner is the passkey-derived owner", g[0].toLowerCase() === owner.toLowerCase()],
  ["grantOf.nsHash matches", g[1] === nsHash],
  ["grantOf.epoch is 1", Number(g[2]) === 1],
  ["grantOf.active is false after revoke", g[4] === false],
  ["epochOf(owner, ns) is 2", Number(epoch) === 2],
  ["an untouched namespace of the same owner is still epoch 1", Number(other) === 1],
  ["revoke mined after grant", rr.blockNumber >= gr.blockNumber],
];
console.log(`registry=${dep.address} chain=10143 read_at_block=${head} grant_block=${gr.blockNumber} revoke_block=${rr.blockNumber}`);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
