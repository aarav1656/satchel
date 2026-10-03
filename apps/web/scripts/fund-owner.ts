// bun fund-owner.ts <0xOwner>   funds a passkey-derived owner from the satchel deployer so it can send grant/revoke.
// The key is read from demo/.wallets.json in-process and never printed. Capped at 0.2 MON per call.
import fs from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const AMOUNT = parseEther("0.1");
const CAP = parseEther("0.2");
const owner = process.argv[2];
const label = process.argv[3] ?? "web-click-through";
const note = process.argv[4] ?? "per-run virtual passkey, key not recoverable, never fund by hand";
if (!owner || !isAddress(owner)) throw new Error("usage: bun fund-owner.ts <0xOwner>");
if (AMOUNT > CAP) throw new Error("funding cap exceeded");

const keys = JSON.parse(fs.readFileSync(new URL("../../../demo/.wallets.json", import.meta.url), "utf8")) as { deployer: Hex };
const account = privateKeyToAccount(keys.deployer);
const transport = http(JSON.parse(fs.readFileSync(new URL("../../../deployments/testnet.json", import.meta.url), "utf8")).rpc);
const pub = createPublicClient({ chain: monadTestnet, transport });
const wallet = createWalletClient({ account, chain: monadTestnet, transport });

const before = await pub.getBalance({ address: owner });
const hash = await wallet.sendTransaction({ to: owner, value: AMOUNT });
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
if (receipt.status !== "success") throw new Error(`funding tx ${hash} reverted`);
// Every funded owner is recorded before anything else can fail: run logs get overwritten, this file does not.
fs.appendFileSync(new URL("../../../demo/owners.log", import.meta.url),
  `${new Date().toISOString()} ${label} owner=${owner} funded=${formatEther(AMOUNT)} tx=${hash} block=${receipt.blockNumber} ${note}\n`);
const after = await pub.getBalance({ address: owner });
if (after - before !== AMOUNT) throw new Error(`owner balance moved by ${formatEther(after - before)}, expected ${formatEther(AMOUNT)}`);
console.log(`FUNDED owner=${owner} amount=${formatEther(AMOUNT)} MON tx=${hash} block=${receipt.blockNumber} owner_balance=${formatEther(after)} deployer_balance=${formatEther(await pub.getBalance({ address: account.address }))}`);
