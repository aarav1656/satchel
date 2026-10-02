import { createPublicClient, formatEther, http, parseAbi, type Address, type Hex } from "viem";
import { monadTestnet } from "viem/chains";
import { REGISTRY_ADDRESS } from "./config";

const abi = parseAbi([
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grantOf(uint256 grantId) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);

const client = createPublicClient({ chain: monadTestnet, transport: http(monadTestnet.rpcUrls.default.http[0], { retryCount: 5, retryDelay: 600 }) });

export const txUrl = (hash: Hex) => `${monadTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: Address) => `${monadTestnet.blockExplorers.default.url}/address/${a}`;
export const short = (h: string) => `${h.slice(0, 10)}...${h.slice(-6)}`;

export async function balanceOf(a: Address): Promise<{ wei: bigint; mon: string }> {
  const wei = await client.getBalance({ address: a });
  return { wei, mon: formatEther(wei) };
}

export async function epochOf(owner: Address, nsHash: Hex): Promise<number> {
  return Math.max(1, Number(await client.readContract({ address: REGISTRY_ADDRESS, abi, functionName: "epochOf", args: [owner, nsHash] })));
}

export async function grantOf(id: string) {
  const [owner, nsHash, epoch, granteeKeyHash, active] = await client.readContract({
    address: REGISTRY_ADDRESS,
    abi,
    functionName: "grantOf",
    args: [BigInt(id)],
  });
  return { owner, nsHash, epoch: Number(epoch), granteeKeyHash, active };
}
