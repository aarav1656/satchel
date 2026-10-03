// The developer's path, run as a consumer would: satchel-sdk installed from the packed tarball, a real Monad testnet
// registry, every chain post-condition read back with viem (not the SDK). `node flow.mjs owner` prints the persistent owner
// address; `node flow.mjs run` executes the flow. The owner's PRF lives in .prf (gitignored), so one funding serves every run.
import fs from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";
import { createGrantee, epochOf, fetchGrant, fromPrfOutput, isSatchelError, ns, nsHashOf } from "satchel-sdk";

const dep = JSON.parse(fs.readFileSync(process.env.DEPLOYMENT, "utf8"));
const registry = { address: dep.address, rpcUrl: dep.rpc, chain: monadTestnet };
const prfFile = new URL("./.prf", `file://${process.env.PRF_DIR}/`);
const prf = () => {
  if (!fs.existsSync(prfFile)) fs.writeFileSync(prfFile, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex"), { mode: 0o600 });
  return new Uint8Array(Buffer.from(fs.readFileSync(prfFile, "utf8").trim(), "hex"));
};
const open = (p, extra = {}) => fromPrfOutput(p, { rpId: "devflow.example", registry, ...extra });

if (process.argv[2] === "owner") {
  const s = await open(prf());
  console.log(s.registryOwner);
  process.exit(0);
}

const pub = createPublicClient({ chain: monadTestnet, transport: http(dep.rpc) });
const abi = parseAbi([
  "function epochOf(address owner, bytes32 nsHash) view returns (uint64)",
  "function grantOf(uint256 id) view returns (address owner, bytes32 nsHash, uint64 epoch, bytes32 granteeKeyHash, bool active)",
]);
const dec = (u) => new TextDecoder().decode(u);
const out = [];
const ok = (name, detail) => { out.push(`PASS ${name}${detail ? `  ${detail}` : ""}`); console.log(out.at(-1)); };
const must = (cond, name) => { if (!cond) { console.log(`FAIL ${name}`); process.exit(1); } };
const code = async (p) => { try { await p; return "NO ERROR"; } catch (e) { return isSatchelError(e) ? e.code : `OTHER ${e?.message}`; } };
const receipt = async (tx) => { const r = await pub.getTransactionReceipt({ hash: tx }); must(r.status === "success", `receipt ${tx} success`); return r; };

// 1. derive: one PRF output, isolated namespaces, stable across sessions
const run = Buffer.from(crypto.getRandomValues(new Uint8Array(4))).toString("hex");
const memory = ns(`dev/memory-${run}`);
const notes = ns(`dev/notes-${run}`);
const s = await open(prf());
const fpMemory = await s.fingerprint(memory);
const fpNotes = await s.fingerprint(notes);
const again = await open(prf());
must(fpMemory !== fpNotes, "two namespaces have different fingerprints");
must((await again.fingerprint(memory)) === fpMemory, "a second session derives the same fingerprint");
again.close();
ok("derive", `owner=${s.registryOwner} ${memory}=${fpMemory} ${notes}=${fpNotes}`);

// 2. seal, unseal, refusals
const blob1 = await s.seal(memory, { likes: "metric units" });
must(blob1.epoch === 1, "fresh namespace seals at epoch 1");
must(dec(await s.unseal(memory, blob1)) === JSON.stringify({ likes: "metric units" }), "unseal returns the sealed JSON");
must((await s.unsealJson(memory, blob1)).likes === "metric units", "unsealJson");
must((await code(s.unseal(notes, blob1))) === "NAMESPACE_MISMATCH", "unseal under another namespace refuses");
const bytes = blob1.toBytes();
const flipped = bytes.slice(); flipped[flipped.length - 1] ^= 1;
must((await code(s.unseal(memory, flipped))) === "WRONG_PASSKEY", "a flipped ciphertext byte refuses, nothing decrypted");
must((await code(s.unseal(memory, bytes.slice(0, 60)))) === "SEAL_CORRUPT", "a truncated blob is SEAL_CORRUPT");
must((await code(s.unseal(memory, new Uint8Array(80)))) === "NOT_SEALED", "foreign bytes are NOT_SEALED");
const stranger = await open(new Uint8Array(crypto.getRandomValues(new Uint8Array(32))));
const strangerCode = await code(stranger.unseal(memory, blob1));
must(strangerCode === "WRONG_PASSKEY", "a different passkey fails closed with WRONG_PASSKEY");
stranger.close();
ok("seal/unseal", `epoch=${blob1.epoch} bytes=${bytes.length} other-namespace=NAMESPACE_MISMATCH flipped=WRONG_PASSKEY truncated=SEAL_CORRUPT foreign=NOT_SEALED other-passkey=${strangerCode}`);

// 3. an owner that cannot pay is told before anything is sent
const poor = await open(new Uint8Array(crypto.getRandomValues(new Uint8Array(32))));
const fern = await createGrantee();
const poorCode = await code(poor.grant(memory, fern.publicKey, { label: "Fern" }));
must(poorCode === "OWNER_UNFUNDED", "an unfunded owner gets OWNER_UNFUNDED");
must((await pub.getBalance({ address: poor.registryOwner })) === 0n, "the unfunded owner still holds 0 MON, so nothing was sent");
poor.close();
ok("owner-unfunded", "OWNER_UNFUNDED before any transaction");

// 4. grant, read back from chain, reader rebuilds it from the tx hash alone
const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });
await receipt(grant.txHash);
const [gOwner, gNs, gEpoch, gKey, gActive] = await pub.readContract({ address: dep.address, abi, functionName: "grantOf", args: [BigInt(grant.id)] });
must(gOwner === s.registryOwner && gNs === nsHashOf(memory) && gEpoch === 1n && gKey === grant.granteeKeyHash && gActive, "grantOf matches the grant");
const mine = await fetchGrant({ txHash: grant.txHash, registry, ns: memory });
must((await fern.reader(mine).unsealJson(blob1)).likes === "metric units", "reader opens the epoch 1 memory from the tx hash");
ok("grant", `id=${grant.id} tx=${grant.txHash} active=${gActive} epoch=${gEpoch}`);

// 5. revoke: epoch moves, old grant dead, new memory sealed at epoch 2 stays closed to Fern
const revoked = await s.revoke(memory, grant.id);
await receipt(revoked.txHash);
const e2 = await pub.readContract({ address: dep.address, abi, functionName: "epochOf", args: [s.registryOwner, nsHashOf(memory)] });
const [, , , , activeAfter] = await pub.readContract({ address: dep.address, abi, functionName: "grantOf", args: [BigInt(grant.id)] });
const eNotes = await pub.readContract({ address: dep.address, abi, functionName: "epochOf", args: [s.registryOwner, nsHashOf(notes)] });
must(e2 === 2n && revoked.epoch === 2 && activeAfter === false, "revoke: epoch 2, grant inactive");
must(eNotes === 1n, "the untouched namespace stays at epoch 1");
const blob2 = await s.seal(memory, { likes: "tea" });
must(blob2.epoch === 2, "new memory sealed at epoch 2");
must((await fern.reader(mine).unsealJson(blob1)).likes === "metric units", "Fern keeps the epoch 1 memory");
must((await code(fern.reader(mine).unseal(blob2))) === "GRANT_REVOKED", "Fern cannot open the epoch 2 memory");
ok("revoke", `tx=${revoked.txHash} epoch ${gEpoch}->${e2} grant ${grant.id} active=${activeAfter} notes-epoch=${eNotes} new-memory=GRANT_REVOKED`);

// 6. regrant: the remaining reader gets a grant for epoch 2
const again2 = await s.regrant(memory, fern.publicKey, { label: "Fern" });
await receipt(again2.txHash);
const mine2 = await fetchGrant({ txHash: again2.txHash, registry, ns: memory });
must((await fern.reader(mine2).unsealJson(blob2)).likes === "tea", "regranted reader opens the epoch 2 memory");
must((await epochOf(registry, s.registryOwner, nsHashOf(memory))) === 2, "SDK epochOf agrees with the chain read");
ok("regrant", `id=${again2.id} tx=${again2.txHash}`);
s.close();
console.log(`DEVFLOW PASS ${out.length} steps  registry=${dep.address}`);
