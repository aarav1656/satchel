import type { Metadata } from "next";
import Link from "next/link";
import { CrossDevicePanel, DerivationPanel, ProofVault, ScanPanel, WrongNamespacePanel } from "@/components/proof/Live";
import { addressUrl, txUrl } from "@/lib/chain";
import { REGISTRY_ADDRESS } from "@/lib/config";
import evidence from "@/lib/evidence.generated.json";
import deployment from "../../../../deployments/testnet.json";

export const metadata: Metadata = { title: "Proof" };

const E = evidence as Record<string, string | undefined>;
/** Evidence links that exist in this build, joined with commas. A missing file drops its link instead of leaving a dead one. */
const links = (items: [key: string, label: string][]) =>
  items
    .filter(([key]) => E[key])
    .map(([key, label], i) => (
      <span key={key}>
        {i > 0 && ", "}
        <a href={E[key]}>{label}</a>
      </span>
    ));

const SMOKE = { grant: deployment.smokeTest.grantTx as `0x${string}`, revoke: deployment.smokeTest.revokeTx as `0x${string}` };

export default function Page() {
  return (
    <main className="demo" style={{ display: "block", maxWidth: 960 }}>
      <h1>What satchel proves</h1>
      <p style={{ color: "var(--steel)", fontSize: 18 }}>
        Satchel&apos;s evidence for the Mera One Passkey Many Keys bounty and Track 04: one passkey ceremony, a separate key for every app and folder, a second app that reads without the passkey, and a registry write that takes the access back. Open your vault once and the live results below fill in from it, against the Monad testnet registry. The recorded runs sit beside each result.
      </p>

      <ProofVault />

      <section>
        <h2 id="novelty">A second app reads your memory without the passkey</h2>
        <p>
          One person&apos;s AI memory, written by one app and read by another. No account, no signer and no wallet address appears on the screen: <Link href="/pip/">Pip</Link> holds the passkey, <Link href="/fern/">Fern</Link> holds its own key and rebuilds its grant from a transaction hash. Revoking moves the folder to a new epoch, Pip seals its memories again there, and Fern's next read is GRANT_REVOKED.
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
          Registry <a href={addressUrl(REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">{REGISTRY_ADDRESS}</a> on Monad testnet. A recorded grant <a href={txUrl(SMOKE.grant)} target="_blank" rel="noreferrer">{SMOKE.grant.slice(0, 10)}</a> and its revoke <a href={txUrl(SMOKE.revoke)} target="_blank" rel="noreferrer">{SMOKE.revoke.slice(0, 10)}</a> moved the namespace from epoch 1 to 2. Recorded: {links([["clickThrough", "the Pip to Fern click-through"], ["onchain", "grant and revoke receipts read back from chain"], ["onchainNegative", "the read-back going red on a wrong value"], ["sdkMutations", "mutation runs on fetchGrant, OWNER_UNFUNDED and openOrEnrol"], ["deployment", "the deployment record"], ["abi", "the ABI"]])}.
        </p>
      </section>

      <section>
        <h2 id="primitives">One passkey, a key per namespace</h2>
        <p>
          Each folder derives its own key from the one passkey output: the HKDF info string, the current epoch and the key fingerprint for your vault, read now. HKDF separates namespaces, AES-256-GCM seals the data with the header as authenticated data, and HPKE hands a reader the epoch key. Recorded: {links([["spikeDerive", "the derivation spike"], ["mutationNamespacingRed", "the namespacing mutation, red"], ["mutationNamespacingGreen", "and green"]])}.
        </p>
        <DerivationPanel />
      </section>

      <section>
        <h2 id="namespaced">A wrong namespace is refused before any decryption</h2>
        <p>
          A record sealed under <code>memory/assistant</code> opens there and fails under <code>memory/notes</code> with <code>NAMESPACE_MISMATCH</code>, before any decryption. The call below is real and ran when your vault opened.
        </p>
        <WrongNamespacePanel />
      </section>

      <section>
        <h2 id="scan">Nothing sensitive stays in the browser</h2>
        <p>The scan reads localStorage, sessionStorage, IndexedDB and cookies for this origin and flags any value that is not ciphertext, a public id or a key the browser will not export.</p>
        <ScanPanel />
      </section>

      <section>
        <h2 id="cross-device">The same keys on a second device</h2>
        <p>
          The same passkey on two devices derives the same keys, so the same namespace prints the same eight characters. The recorded run opens the vault in a fresh page load and gets the fingerprint it had before: {links([["ceremony", "the passkey ceremony with a fresh page load and a foreign authenticator"], ["ceremonyNegative", "its negative control"]])}.
        </p>
        <CrossDevicePanel />
      </section>
    </main>
  );
}
