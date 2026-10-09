// One-shot Monad testnet grant + revoke for memory/trading-desk. Uses devflow/.state/.prf (no secrets printed).
import fs from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";
import { createGrantee, fetchGrant, fromPrfOutput, isSatchelError, ns, nsHashOf } from "satchel-sdk";

const dep = JSON.parse(fs.readFileSync(process.env.DEPLOYMENT, "utf8"));
const registry = { address: dep.address, rpcUrl: dep.rpc, chain: monadTestnet };
const prfFile = `${process.env.PRF_DIR}/.prf`;
const prf = new Uint8Array(Buffer.from(fs.readFileSync(prfFile, "utf8").trim(), "hex"));
const trading = ns("memory/trading-desk");

const pub = createPublicClient({ chain: monadTestnet, transport: http(dep.rpc) });
const abi = parseAbi([
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grantOf(uint256 id) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);
const receipt = async (tx) => {
  const r = await pub.waitForTransactionReceipt({ hash: tx, timeout: 120_000, pollingInterval: 400 });
  if (r.status !== "success") throw new Error(`receipt failed ${tx}`);
  return r;
};
const code = async (p) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return isSatchelError(e) ? e.code : "ERR";
  }
};

const s = await fromPrfOutput(prf, { rpId: "devflow.example", registry });
const fern = await createGrantee();
const note = "Long BTC perp above 94.2k; revoke test";
const blob1 = await s.seal(trading, { text: note, at: Date.now() });

const grant = await s.grant(trading, fern.publicKey, { label: "Fern" });
await receipt(grant.txHash);
const mine = await fetchGrant({ txHash: grant.txHash, registry, ns: trading });
const opened = await fern.reader(mine).unsealJson(blob1);
if (opened.text !== note) throw new Error("pre-revoke unseal failed");

const revoked = await s.revoke(trading, grant.id);
await receipt(revoked.txHash);
const blob2 = await s.seal(trading, { text: "POST REVOKE MUST NOT READ", at: Date.now() + 1 });
const post = await code(fern.reader(mine).unsealJson(blob2));
if (post !== "GRANT_REVOKED") throw new Error(`expected GRANT_REVOKED got ${post}`);

const e2 = await pub.readContract({ address: dep.address, abi, functionName: "epochOf", args: [s.registryOwner, nsHashOf(trading)] });
const [, , , , active] = await pub.readContract({ address: dep.address, abi, functionName: "grantOf", args: [BigInt(grant.id)] });
if (e2 !== 2n || active !== false) throw new Error("chain postconditions failed");

console.log(`GRANT_TX=${grant.txHash}`);
console.log(`REVOKE_TX=${revoked.txHash}`);
console.log(`POST_REVOKE=${post}`);
s.close();
