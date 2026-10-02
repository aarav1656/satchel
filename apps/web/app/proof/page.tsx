import type { Metadata } from "next";
import Link from "next/link";
import { CrossDevicePanel, DerivationPanel, ScanPanel, WrongNamespacePanel } from "@/components/proof/Live";
import { addressUrl, txUrl } from "@/lib/chain";
import { REGISTRY_ADDRESS } from "@/lib/config";
import evidence from "@/lib/evidence.generated.json";
import deployment from "../../../../deployments/testnet.json";

export const metadata: Metadata = { title: "Proof" };

const E = evidence as Record<string, string | undefined>;
const link = (key: string, label: string) => (E[key] ? <a href={E[key]}>{label}</a> : null);

const SMOKE = { grant: deployment.smokeTest.grantTx as `0x${string}`, revoke: deployment.smokeTest.revokeTx as `0x${string}` };

export default function Page() {
  return (
    <main className="demo" style={{ display: "block", maxWidth: 960 }}>
      <h1>Proof</h1>
      <p style={{ color: "var(--steel)", fontSize: 18 }}>
        Four judging lines for the One Passkey, Many Keys bounty. Each row has something to click in your own browser and the recorded evidence behind it.
      </p>

      <div className="table-wrap proof-table">
        <table>
          <thead>
            <tr><th>Judging line</th><th>Click</th><th>Recorded evidence</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><a href="#novelty">Novelty</a></td>
              <td>Open Fern</td>
              <td>{link("clickThrough", "Pip to Fern click-through log")}{E.clickThrough ? ", " : ""}{link("onchain", "receipts read back from chain")}{E.onchainNegative ? ", " : ""}{link("onchainNegative", "negative control")}</td>
            </tr>
            <tr>
              <td><a href="#primitives">Correct use of the primitives</a></td>
              <td>Show derivation</td>
              <td>{link("spikeDerive", "derivation spike")}{E.spikeDerive ? ", " : ""}{link("mutationNamespacingRed", "mutation red")}, {link("mutationNamespacingGreen", "green")}</td>
            </tr>
            <tr>
              <td><a href="#namespaced">Salts genuinely namespaced, nothing sensitive persisted</a></td>
              <td>Try the wrong namespace, Scan this browser</td>
              <td>{link("mutationNamespacingRed", "namespacing mutation, red")}, {link("mutationNamespacingGreen", "green")}</td>
            </tr>
            <tr>
              <td><a href="#cross-device">The cross-device test</a></td>
              <td>Open on another device</td>
              <td>{link("ceremony", "passkey ceremony with a fresh page load and a foreign authenticator")}, {link("ceremonyNegative", "negative control")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section>
        <h2 id="novelty">Novelty</h2>
        <p>
          One user&apos;s AI memory, written by one app and read by another. No account, no signer and no wallet address appears on the screen: Pip holds the passkey, <Link href="/fern/">Fern</Link> holds its own key and a grant.
        </p>
        <div className="btn-row">
          <Link href="/fern/" className="btn">
            Open Fern
          </Link>
          <Link href="/pip/" className="btn btn-secondary">
            Open Pip
          </Link>
        </div>
        <p className="small muted">
          Registry <a href={addressUrl(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">{REGISTRY_ADDRESS}</a> on Monad testnet. A recorded grant <a href={txUrl(SMOKE.grant)} target="_blank" rel="noreferrer">{SMOKE.grant.slice(0, 10)}</a> and its revoke <a href={txUrl(SMOKE.revoke)} target="_blank" rel="noreferrer">{SMOKE.revoke.slice(0, 10)}</a> moved the namespace from epoch 1 to 2 ({link("deployment", "deployment record")}, {link("abi", "ABI")}).
        </p>
      </section>

      <section>
        <h2 id="primitives">Correct use of the primitives</h2>
        <p>
          For each namespace: the HKDF info string, the current epoch and the key fingerprint, read from your own vault. Derivation separates namespaces, AES-256-GCM seals the data with the header as authenticated data, HPKE hands a reader the epoch key.
        </p>
        <DerivationPanel />
      </section>

      <section>
        <h2 id="namespaced">Salts genuinely namespaced, nothing sensitive persisted</h2>
        <p>
          A record sealed under <code>memory/assistant</code> opens there and fails under <code>memory/notes</code> with <code>NAMESPACE_MISMATCH</code>, before any decryption. The call below is real.
        </p>
        <WrongNamespacePanel />
        <h3 id="scan" style={{ fontSize: 18 }}>What this browser holds</h3>
        <p>The scan reads localStorage, sessionStorage, IndexedDB and cookies for this origin and flags any value that is not ciphertext or a public id.</p>
        <ScanPanel />
      </section>

      <section>
        <h2 id="cross-device">The cross-device test</h2>
        <p>
          The same passkey on two devices derives the same keys, so the same namespace prints the same eight characters. The recorded run opens the vault in a fresh page load and gets the fingerprint it had before.
        </p>
        <CrossDevicePanel />
      </section>
    </main>
  );
}
