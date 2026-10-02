import {
  type Address,
  BaseError,
  type Chain,
  type Hex,
  InsufficientFundsError,
  type PublicClient,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatGwei,
  parseEventLogs,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { nsHashOf, type Namespace } from "./derive.js";
import { SatchelError } from "./errors.js";
import type { FetchedGrant, Grant } from "./grant.js";

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

const unreachable = (message: string, o: { cause?: unknown; fix?: string } = {}) =>
  new SatchelError("REGISTRY_UNREACHABLE", message, { ...(o.fix ? { fix: o.fix } : {}), ...(o.cause === undefined ? {} : { cause: o.cause }) });

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
    throw unreachable(`Registry ${r.address} did not answer epochOf: ${reason(cause)}.`, { cause });
  }
}

const FAUCET = "https://faucet.monad.xyz";
const isInsufficientFunds = (e: unknown) => e instanceof BaseError && e.walk((x) => x instanceof InsufficientFundsError) !== null;

/**
 * Monad charges gas limit times price up front, so the owner must hold that much before the transaction is sent.
 * Reads the balance and the gas estimate (without fee fields, which an unfunded account would fail on) and throws
 * OWNER_UNFUNDED with the shortfall. A node that cannot answer is REGISTRY_UNREACHABLE; a revert in the estimate
 * is REGISTRY_UNREACHABLE with its reason.
 */
async function ensureFunded(r: Registry, ownerKey: Hex, functionName: "grant" | "revoke", args: readonly unknown[]): Promise<bigint> {
  const { chain, pub } = clients(r);
  const owner = privateKeyToAccount(ownerKey).address;
  let balance: bigint;
  let price: bigint;
  try {
    [balance, price] = await Promise.all([pub.getBalance({ address: owner }), pub.estimateFeesPerGas().then((f) => f.maxFeePerGas ?? 0n)]);
  } catch (cause) {
    throw unreachable(`Monad RPC did not answer the balance read for owner ${owner}: ${reason(cause)}.`, { cause });
  }
  let gas: bigint;
  try {
    gas = await pub.estimateContractGas({ address: r.address, abi: registryAbi, functionName, args, account: owner } as never);
  } catch (cause) {
    throw unreachable(`Registry ${functionName} was not accepted: ${reason(cause)}.`, { cause });
  }
  const need = gas * price;
  if (balance >= need) return gas;
  const short = formatEther(need - balance);
  const symbol = chain.nativeCurrency.symbol;
  const where = chain.id === 10143 ? `testnet ${symbol} from the faucet ${FAUCET}` : `${symbol} on ${chain.name}`;
  throw new SatchelError(
    "OWNER_UNFUNDED",
    `Owner ${owner} holds ${formatEther(balance)} ${symbol} on ${chain.name}; ${functionName} needs ${formatEther(need)} ${symbol} (gas ${gas} at up to ${formatGwei(price)} gwei). Short by ${short} ${symbol}.`,
    { fix: `send at least ${short} ${symbol} to ${owner} (${where}), then call ${functionName}() again.` },
  );
}

async function send(r: Registry, ownerKey: Hex, functionName: "grant" | "revoke", args: readonly unknown[]) {
  const { chain, transport, pub } = clients(r);
  const gas = await ensureFunded(r, ownerKey, functionName, args);
  const wallet = createWalletClient({ account: privateKeyToAccount(ownerKey), chain, transport });
  let hash: Hex;
  try {
    hash = await wallet.writeContract({ address: r.address, abi: registryAbi, functionName, args, gas } as never);
  } catch (cause) {
    // The balance moved or the fee rose between the check and the send: run the check again for the exact shortfall.
    if (isInsufficientFunds(cause)) await ensureFunded(r, ownerKey, functionName, args);
    throw unreachable(`Registry ${functionName} was not accepted: ${reason(cause)}.`, { cause });
  }
  let receipt;
  try {
    receipt = await pub.waitForTransactionReceipt({ hash, timeout: CONFIRM_TIMEOUT_MS, pollingInterval: 400, retryCount: 8 });
  } catch (cause) {
    throw unreachable(`Monad RPC did not confirm tx ${hash} within ${CONFIRM_TIMEOUT_MS / 1000}s. The seal succeeded; the epoch update may not have.`, {
      cause,
      fix: "call epochOf(registry, session.registryOwner, nsHashOf(ns)) to see whether it landed; if the epoch did not move, call it again.",
    });
  }
  if (receipt.status !== "success") {
    throw unreachable(`Registry ${functionName} tx ${hash} reverted.`, { fix: "check you own the namespace and the grant is still active." });
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

export interface FetchGrantOptions {
  /** The hash `grant()` returned as `txHash`. */
  txHash: Hex;
  /** The registry the grant was sent to, as an address or a full Registry. */
  registry: Address | Registry;
  /** Overrides the registry's RPC for this read. */
  rpcUrl?: string;
  chain?: Chain;
  /** The namespace the reader expects. The chain holds only its hash, so this is checked against it and returned as `ns`. */
  ns?: Namespace;
}

/**
 * Reads the Granted event out of one transaction's receipt (a receipt lookup, never an eth_getLogs range scan, which
 * Monad's public RPC caps at 100 blocks) and returns the Grant a reader can open with its own key. The wrapped key in
 * the event is HPKE-sealed to the grantee's public key, so a reader holding another key gets GRANT_NOT_FOR_KEY.
 */
export async function fetchGrant(o: FetchGrantOptions & { ns: Namespace }): Promise<Grant>;
export async function fetchGrant(o: FetchGrantOptions): Promise<FetchedGrant>;
export async function fetchGrant(o: FetchGrantOptions): Promise<Grant | FetchedGrant> {
  const base: Registry = typeof o.registry === "string" ? { address: o.registry } : o.registry;
  const r: Registry = { ...base, ...(o.rpcUrl ? { rpcUrl: o.rpcUrl } : {}), ...(o.chain ? { chain: o.chain } : {}) };
  let receipt;
  try {
    receipt = await clients(r).pub.waitForTransactionReceipt({ hash: o.txHash, timeout: 15_000, pollingInterval: 400, retryCount: 8 });
  } catch (cause) {
    throw unreachable(`Monad RPC returned no receipt for tx ${o.txHash}: ${reason(cause)}.`, {
      cause,
      fix: "check txHash is the hash grant() returned and that rpcUrl is the chain it was sent on, then retry.",
    });
  }
  if (receipt.status !== "success") {
    throw unreachable(`Grant tx ${o.txHash} reverted, so no grant exists.`, { fix: "ask the owner to call grant() again and pass the new txHash." });
  }
  const [ev] = parseEventLogs({ abi: registryAbi, eventName: "Granted", logs: receipt.logs.filter((l) => sameAddress(l.address, r.address)) });
  if (!ev) {
    throw unreachable(`Tx ${o.txHash} has no Granted event from registry ${r.address}.`, {
      fix: "pass the hash grant() returned as txHash and the address of the registry it was sent to.",
    });
  }
  if (o.ns !== undefined && nsHashOf(o.ns) !== ev.args.nsHash) {
    throw new SatchelError("NAMESPACE_MISMATCH", `Grant ${ev.args.grantId} covers namespace hash ${ev.args.nsHash}; "${o.ns}" hashes to ${nsHashOf(o.ns)}.`, {
      fix: "ask for the grant of the namespace you meant, or omit ns to read the grant without naming it.",
    });
  }
  return {
    id: ev.args.grantId.toString(),
    ...(o.ns !== undefined ? { ns: o.ns } : {}),
    nsHash: ev.args.nsHash,
    epoch: Number(ev.args.epoch),
    granteeKeyHash: ev.args.granteeKeyHash,
    wrappedKey: ev.args.wrappedKey,
    label: ev.args.label,
    txHash: o.txHash,
  };
}
