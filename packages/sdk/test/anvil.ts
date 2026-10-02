import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { type Chain, createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const CONTRACTS = new URL("../../../contracts", import.meta.url).pathname;
const OUT = "/tmp/satchel-sdk-forge";
// anvil's published development account #0: a public test key printed by every anvil, not a secret
const ANVIL_DEV_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export function compileRegistry(): Hex {
  execFileSync("forge", ["build", "--root", CONTRACTS, "--out", `${OUT}/out`, "--cache-path", `${OUT}/cache`, "--skip", "test", "--skip", "script"], { stdio: "pipe" });
  const art = JSON.parse(readFileSync(`${OUT}/out/SatchelRegistry.sol/SatchelRegistry.json`, "utf8"));
  return art.bytecode.object as Hex;
}

export async function startAnvil(port: number, extra: string[] = []): Promise<{ rpcUrl: string; stop(): void; proc: ChildProcess }> {
  const proc = spawn("anvil", ["--port", String(port), "--silent", "--hardfork", "osaka", ...extra], { stdio: "ignore" });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const pub = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  for (let i = 0; i < 100; i++) {
    try {
      await pub.getChainId();
      return { rpcUrl, proc, stop: () => proc.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  proc.kill();
  throw new Error(`anvil did not come up on ${rpcUrl}`);
}

export async function deployRegistry(rpcUrl: string, bytecode: Hex, chain: Chain = foundry): Promise<Address> {
  const wallet = createWalletClient({ account: privateKeyToAccount(ANVIL_DEV_KEY), chain, transport: http(rpcUrl) });
  const pub = createPublicClient({ chain, transport: http(rpcUrl) });
  const hash = await wallet.sendTransaction({ data: bytecode });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error("registry deploy failed");
  return r.contractAddress;
}

export async function fund(rpcUrl: string, who: Address) {
  await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [who, "0x3635C9ADC5DEA00000"] }) });
}

export async function setBalance(rpcUrl: string, who: Address, wei: bigint) {
  await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setBalance", params: [who, `0x${wei.toString(16)}`] }) });
}
