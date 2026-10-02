// Deploys SatchelRegistry, funds the smoke key from the deployer, then runs grant -> revoke from the smoke key
// and reads epochOf/grantOf back. Keys come from demo/.wallets.json in-process and are never printed.
//   bun run deploy-and-smoke.ts                      Monad testnet, writes deployments/testnet.json
//   SATCHEL_RPC=http://127.0.0.1:8545 SATCHEL_FUND_LOCAL=1 SATCHEL_OUT=/tmp/x.json bun run deploy-and-smoke.ts
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient, createWalletClient, decodeEventLog, formatEther, http, keccak256, parseEther, toHex,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(import.meta.dir, "..");
const RPC = process.env.SATCHEL_RPC ?? "https://testnet-rpc.monad.xyz";
const OUT = process.env.SATCHEL_OUT ?? path.join(ROOT, "deployments/testnet.json");
const SMOKE_FUNDING = parseEther("0.1");
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;

const keys = JSON.parse(fs.readFileSync(path.join(import.meta.dir, ".wallets.json"), "utf8")) as { deployer: Hex; smoke: Hex };
const deployer = privateKeyToAccount(keys.deployer);
const smoke = privateKeyToAccount(keys.smoke);
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts/out/SatchelRegistry.sol/SatchelRegistry.json"), "utf8"));
const abi = artifact.abi;
const pub = createPublicClient({ chain, transport: http(RPC) });
const wDeployer = createWalletClient({ account: deployer, chain, transport: http(RPC) });
const wSmoke = createWalletClient({ account: smoke, chain, transport: http(RPC) });

if (process.env.SATCHEL_FUND_LOCAL === "1") {
  await pub.request({ method: "anvil_setBalance" as never, params: [deployer.address, toHex(parseEther("5"))] as never });
}
const gas: Record<string, number> = {};
const confirm = async (name: string, hash: Hex) => {
  const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000 });
  if (r.status !== "success") throw new Error(`${name} reverted: ${hash}`);
  gas[name] = Number(r.gasUsed);
  return r;
};
const withMargin = (g: bigint) => (g * 12n) / 10n; // monad bills gas limit, so keep the limit near the estimate

const startBal = await pub.getBalance({ address: deployer.address });
console.log(`chain ${await pub.getChainId()} deployer ${deployer.address} balance ${formatEther(startBal)} MON`);
if (startBal < parseEther("0.3")) throw new Error("deployer balance below 0.3 MON, fund it first");

// 1. deploy
const deployGas = await pub.estimateGas({ account: deployer.address, data: artifact.bytecode.object as Hex });
const deployTx = await wDeployer.deployContract({ abi, bytecode: artifact.bytecode.object as Hex, gas: withMargin(deployGas) });
const dr = await confirm("deploy", deployTx);
const address = dr.contractAddress;
if (!address) throw new Error("no contract address in receipt");
const code = await pub.getCode({ address });
if (!code || code === "0x") throw new Error("post-condition failed: no code at deployed address");
const next = await pub.readContract({ address, abi, functionName: "nextGrantId" });
if (next !== 1n) throw new Error(`post-condition failed: nextGrantId ${next}`);
console.log(`deployed ${address} tx ${deployTx} block ${dr.blockNumber} gas ${dr.gasUsed} codeBytes ${(code.length - 2) / 2}`);

// 2. fund the smoke key from the deployer
const fundTx = await wDeployer.sendTransaction({ to: smoke.address, value: SMOKE_FUNDING, gas: 21_000n });
await confirm("fund", fundTx);
const smokeBal = await pub.getBalance({ address: smoke.address });
if (smokeBal < SMOKE_FUNDING) throw new Error(`post-condition failed: smoke balance ${smokeBal}`);
console.log(`funded ${smoke.address} tx ${fundTx} balance ${formatEther(smokeBal)} MON`);

// 3. grant -> revoke from the smoke key
const nsHash = keccak256(toHex("satchel/ns/smoke-" + Date.now()));
const granteeKeyHash = keccak256(generatePrivateKey());
const wrappedKey = toHex(crypto.getRandomValues(new Uint8Array(113))); // 65 B P-256 enc + 32 B key + 16 B tag
const label = "smoke reader";
const epochBefore = await pub.readContract({ address, abi, functionName: "epochOf", args: [smoke.address, nsHash] });

const grantReq = { address, abi, account: smoke, functionName: "grant", args: [nsHash, granteeKeyHash, wrappedKey, label] } as const;
const sim = await pub.simulateContract(grantReq);
const grantTx = await wSmoke.writeContract({ ...sim.request, gas: withMargin(await pub.estimateContractGas(grantReq)) });
const gr = await confirm("grant", grantTx);
const granted = gr.logs
  .filter((l) => l.address.toLowerCase() === address.toLowerCase())
  .map((l) => decodeEventLog({ abi, data: l.data, topics: l.topics }))
  .find((e) => e.eventName === "Granted");
if (!granted || granted.eventName !== "Granted") throw new Error("no Granted event in receipt");
const ev = granted.args;
if (ev.owner !== smoke.address || ev.nsHash !== nsHash || ev.granteeKeyHash !== granteeKeyHash || ev.wrappedKey !== wrappedKey || ev.label !== label || ev.epoch !== epochBefore) {
  throw new Error("Granted event fields do not match what was sent");
}
const grantId = ev.grantId;
const [gOwner, gNs, gEpoch, gGrantee, gActive] = await pub.readContract({ address, abi, functionName: "grantOf", args: [grantId] });
if (gOwner !== smoke.address || gNs !== nsHash || gEpoch !== epochBefore || gGrantee !== granteeKeyHash || !gActive) {
  throw new Error("post-condition failed: grantOf after grant");
}
console.log(`grant ${grantTx} id ${grantId} epoch ${gEpoch} active ${gActive}`);

// negative case on chain: the deployer is not the owner of this grant, so revoke must revert (eth_call, no tx)
let foreignReverted = false;
try {
  await pub.simulateContract({ address, abi, account: deployer, functionName: "revoke", args: [nsHash, grantId] });
} catch (e) {
  foreignReverted = String((e as Error).message).includes("NotGrantOwner");
}
if (!foreignReverted) throw new Error("foreign revoke did not revert with NotGrantOwner");

const revokeReq = { address, abi, account: smoke, functionName: "revoke", args: [nsHash, grantId] } as const;
const revokeSim = await pub.simulateContract(revokeReq);
const revokeTx = await wSmoke.writeContract({ ...revokeSim.request, gas: withMargin(await pub.estimateContractGas(revokeReq)) });
await confirm("revoke", revokeTx);
const epochAfter = await pub.readContract({ address, abi, functionName: "epochOf", args: [smoke.address, nsHash] });
const [, , gEpoch2, , gActive2] = await pub.readContract({ address, abi, functionName: "grantOf", args: [grantId] });
if (epochAfter !== epochBefore + 1n) throw new Error(`post-condition failed: epoch ${epochBefore} -> ${epochAfter}`);
if (gActive2) throw new Error("post-condition failed: grant still active after revoke");
if (gEpoch2 !== epochBefore) throw new Error("post-condition failed: grant epoch changed");
console.log(`revoke ${revokeTx} epoch ${epochBefore} -> ${epochAfter} active ${gActive2}`);

const endBal = await pub.getBalance({ address: deployer.address });
const result = {
  chainId: 10143,
  rpc: RPC.includes("testnet-rpc.monad.xyz") ? RPC : "local fork",
  address,
  deployTx,
  deployBlock: Number(dr.blockNumber),
  deployer: deployer.address,
  abi: "deployments/SatchelRegistry.abi.json",
  smokeTest: {
    smoker: smoke.address,
    fundTx,
    nsHash,
    grantId: Number(grantId),
    grantTx,
    revokeTx,
    epochBefore: Number(epochBefore),
    epochAfter: Number(epochAfter),
    grantActiveAfterRevoke: gActive2,
    foreignRevokeReverted: foreignReverted,
  },
  gasUsed: gas,
  deployerSpentMON: formatEther(startBal - endBal),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(path.join(ROOT, "deployments/SatchelRegistry.abi.json"), JSON.stringify(abi, null, 2) + "\n");
console.log(JSON.stringify({ gasUsed: gas, deployerSpentMON: result.deployerSpentMON }));
