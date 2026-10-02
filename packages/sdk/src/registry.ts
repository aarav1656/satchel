import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  parseEventLogs,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { SatchelError } from "./errors.js";

export const registryAbi = parseAbi([
  "event Granted(address indexed owner, bytes32 indexed nsHash, uint256 indexed grantId, uint64 epoch, bytes32 granteeKeyHash, bytes wrappedKey, string label)",
  "event Revoked(address indexed owner, bytes32 indexed nsHash, uint256 indexed grantId, uint64 newEpoch)",
  "event Rotated(address indexed owner, bytes32 indexed nsHash, uint64 newEpoch)",
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grant(bytes32 nsHash, bytes32 granteeKeyHash, bytes wrappedKey, string label) returns (uint256 grantId, uint64 epoch)",
  "function revoke(bytes32 nsHash, uint256 grantId) returns (uint64 newEpoch)",
  "function rotate(bytes32 nsHash) returns (uint64 newEpoch)",
  "function grantOf(uint256 grantId) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);

/** The epoch registry. Defaults to Monad testnet (chain 10143); pass `chain` and `rpcUrl` for any other EVM chain. */
export interface Registry {
  address: Address;
  rpcUrl?: string;
  chain?: Chain;
}

const CONFIRM_TIMEOUT_MS = 30_000;

const unreachable = (message: string, cause?: unknown, fix?: string) =>
  new SatchelError("REGISTRY_UNREACHABLE", message, { ...(fix ? { fix } : {}), ...(cause === undefined ? {} : { cause }) });

const reason = (e: unknown) => (e instanceof Error ? (e as { shortMessage?: string }).shortMessage ?? e.message : String(e)).split("\n")[0];

function clients(r: Registry) {
  const chain = r.chain ?? monadTestnet;
  const transport = http(r.rpcUrl ?? chain.rpcUrls.default.http[0]);
  return { chain, transport, pub: createPublicClient({ chain, transport }) as PublicClient };
}

export async function epochOf(r: Registry, owner: Address, nsHash: Hex): Promise<number> {
  try {
    const e = await clients(r).pub.readContract({ address: r.address, abi: registryAbi, functionName: "epochOf", args: [owner, nsHash] });
    return Math.max(1, Number(e));
  } catch (cause) {
    throw unreachable(`Registry ${r.address} did not answer epochOf: ${reason(cause)}.`, cause);
  }
}

async function send(r: Registry, ownerKey: Hex, functionName: "grant" | "revoke", args: readonly unknown[]) {
  const { chain, transport, pub } = clients(r);
  const wallet = createWalletClient({ account: privateKeyToAccount(ownerKey), chain, transport });
  let hash: Hex;
  try {
    // viem estimates gas first, so a revert (not the owner, inactive grant) surfaces here with its reason.
    hash = await wallet.writeContract({ address: r.address, abi: registryAbi, functionName, args } as never);
  } catch (cause) {
    throw unreachable(`Registry ${functionName} was not accepted: ${reason(cause)}.`, cause);
  }
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS, pollingInterval: 400, retryCount: 8 });
  } catch (cause) {
    throw unreachable(
      `Monad RPC did not confirm tx ${hash} within ${CONFIRM_TIMEOUT_MS / 1000}s. The seal succeeded; the epoch update may not have.`,
      cause,
      "read epochOf() to see whether it landed; if the epoch did not move, call it again.",
    );
  }
  if (receipt.status !== "success") {
    throw unreachable(`Registry ${functionName} tx ${hash} reverted.`, undefined, "check you own the namespace and the grant is still active.");
  }
  return { hash, receipt };
}

export async function grantOnChain(r: Registry, ownerKey: Hex, nsHash: Hex, keyHash: Hex, wrappedKey: Hex, label: string) {
  const { hash, receipt } = await send(r, ownerKey, "grant", [nsHash, keyHash, wrappedKey, label]);
  const [ev] = parseEventLogs({ abi: registryAbi, eventName: "Granted", logs: receipt.logs.filter((l) => sameAddress(l.address, r.address)) });
  if (!ev) throw unreachable(`Registry grant tx ${hash} succeeded but emitted no Granted event.`);
  return { txHash: hash, grantId: ev.args.grantId, epoch: Number(ev.args.epoch) };
}

export async function revokeOnChain(r: Registry, ownerKey: Hex, nsHash: Hex, grantId: bigint) {
  const { hash, receipt } = await send(r, ownerKey, "revoke", [nsHash, grantId]);
  const [ev] = parseEventLogs({ abi: registryAbi, eventName: "Revoked", logs: receipt.logs.filter((l) => sameAddress(l.address, r.address)) });
  if (!ev) throw unreachable(`Registry revoke tx ${hash} succeeded but emitted no Revoked event.`);
  return { txHash: hash, epoch: Number(ev.args.newEpoch) };
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
