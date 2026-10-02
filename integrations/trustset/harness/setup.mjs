// node setup.mjs <rpc> <artifacts-dir>: deploys trustset's real KillSwitch and SealedNotes to a local anvil, registers
// one agent whose cold key is a fresh random owner key, and writes config.json for the page. The key is never printed.
import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const [rpc, out] = process.argv.slice(2);
const art = (n) => JSON.parse(readFileSync(`${out}/${n}.sol/${n}.json`, "utf8"));
const p = new ethers.JsonRpcProvider(rpc);
const ownerKey = ethers.Wallet.createRandom().privateKey;
const owner = new ethers.Wallet(ownerKey, p);
const agent = ethers.Wallet.createRandom().connect(p);
for (const w of [owner, agent]) await p.send("anvil_setBalance", [w.address, "0x56bc75e2d63100000"]);
const nm = new ethers.NonceManager(owner);
const deploy = async (n, args) => {
  const a = art(n);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode.object, nm).deploy(...args);
  await c.waitForDeployment();
  return c;
};
const ks = await deploy("KillSwitch", [60, 60, 60]);
const notes = await deploy("SealedNotes", [await ks.getAddress()]);
await (await ks.connect(agent).register(agent.address, owner.address, [], 0, "0x")).wait();
const agentId = (await ks.agentIdByKey(agent.address)).toString();
if (agentId !== "1") throw new Error(`expected agent 1, got ${agentId}`);
writeFileSync(new URL("./config.json", import.meta.url), JSON.stringify({ rpc, notes: await notes.getAddress(), agentId, ownerKey }));
console.log(`SETUP rpc=${rpc} killswitch=${await ks.getAddress()} sealednotes=${await notes.getAddress()} agentId=${agentId} coldKey=${owner.address}`);
