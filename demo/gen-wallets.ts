// Creates demo/.wallets.json (0600, gitignored) with a deployer and a smoke-test key. Prints addresses only.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = path.join(import.meta.dir, ".wallets.json");
execFileSync("git", ["check-ignore", "-q", file], { cwd: import.meta.dir }); // throws (exit 1) if not ignored
if (fs.existsSync(file)) throw new Error(".wallets.json already exists, refusing to overwrite keys");
const keys = { deployer: generatePrivateKey(), smoke: generatePrivateKey() };
fs.writeFileSync(file, JSON.stringify(keys, null, 2) + "\n", { mode: 0o600 });
fs.chmodSync(file, 0o600);
for (const [name, k] of Object.entries(keys)) console.log(name, privateKeyToAccount(k).address);
