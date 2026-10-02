import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { REGISTRY_ADDRESS } from "@/lib/config";

export const metadata: Metadata = { title: "Grants and epochs" };

const REGRANT = `// Fern and Bob both hold grants at epoch 1.
await s.revoke(memory, fernGrant.id);               // epoch 1 to 2 for the whole namespace
const fresh = await s.seal(memory, "epoch two");

await bob.reader(bobGrant).unseal(fresh);        // throws GRANT_REVOKED: Bob's grant opens epoch 1 only
const again = await s.regrant(memory, bob.publicKey, { label: "Bob" });   // epoch 2
await bob.reader(again).unseal(fresh);           // opens
await fern.reader(fernGrant).unseal(fresh);      // still throws GRANT_REVOKED: Fern was not regranted`;

export default function Page() {
  return (
    <Doc>
      <h1>Grants and epochs</h1>
      <p>A grant gives one app a key to one namespace. Revoking moves the namespace to a new epoch, so nothing sealed afterwards opens for that app.</p>

      <h2 id="grant">Grant</h2>
      <p>
        The reading app calls <Link href="/reference/api/#creategrantee">createGrantee()</Link>, which generates a P-256 key pair and never touches the passkey. Its public key travels to the owner over any channel. <code>s.grant(ns, publicKey, {"{"} label {"}"})</code> wraps the namespace&apos;s current epoch key to that public key with HPKE (RFC 9180, DHKEM P-256, HKDF-SHA256, AES-128-GCM) and records the grant in the registry. The wrapped key is also in the transaction&apos;s <code>Granted</code> event, which is why a grant is portable: <Link href="/reference/api/#fetchgrant">fetchGrant</Link> rebuilds it from the transaction hash alone. <Link href="/guides/two-apps/">Two apps</Link> shows the handoff.
      </p>

      <h2 id="epoch">Epoch</h2>
      <p>
        The registry stores one counter per owner and namespace hash. The namespace path is not on chain, only its hash. <code>seal()</code> reads the counter and encrypts under that epoch&apos;s key. <code>revoke()</code> deactivates the grant and increments the counter in one transaction.
      </p>
      <CodeBlock
        lang="text"
        file="registry"
        code={`registry   ${REGISTRY_ADDRESS}   Monad testnet, chain 10143
epochOf(owner, nsHash)             view, the current epoch
grant(nsHash, keyHash, key, label) emits Granted(owner, nsHash, grantId, epoch, ...)
revoke(nsHash, grantId)            emits Revoked(owner, nsHash, grantId, newEpoch)
grantOf(grantId)                   view, owner, nsHash, epoch, keyHash, active`}
      />

      <h2 id="revoked">What a revoked reader still holds</h2>
      <p>
        A grant opens exactly one epoch. After revoke, a reader&apos;s grant still opens every record already sealed at its epoch, because it already had that key: no system can take back what an app has read. Records sealed from the new epoch on use a key the revoked app cannot derive, and <code>Reader.unseal</code> answers <Link href="/reference/errors/#grant-revoked"><code>GRANT_REVOKED</code></Link> without attempting decryption.
      </p>
      <Callout>
        <p>Open <Link href="/fern/">Fern</Link> after revoking in <Link href="/pip/share/">Pip</Link> to see both halves: the old memory still reads, the new one is locked with the error code.</p>
      </Callout>

      <h2 id="revoke-all">Revoking one grant moves every reader</h2>
      <p>
        The epoch belongs to the namespace, not to a grant. When the owner revokes Fern, the counter goes from 1 to 2 for everyone: every other app that holds a grant on the same namespace has a grant for epoch 1, so it stops opening records sealed from epoch 2 on, although its own grant is still active in the registry. Until it is granted again it reads what was sealed before and nothing newer.
      </p>
      <p>
        <Link href="/reference/api/#satchel-regrant">regrant</Link> is the owner&apos;s call for the readers that should stay: it issues a fresh grant at the current epoch, one more registry transaction per reader. The revoked app is simply not regranted.
      </p>
      <CodeBlock file="regrant.js" code={REGRANT} />
      <p>
        This is the cost of a revoke that needs no per-record bookkeeping: one counter stops one app and every other app asks once to continue. Records already sealed are not re-encrypted, so they stay readable under the grants of their own epoch.
      </p>

      <h2 id="owner">Who pays</h2>
      <p>
        The registry owner is an EOA derived from the passkey root (<code>s.registryOwner</code>). It sends <code>grant</code>, <code>regrant</code> and <code>revoke</code>, so it needs a little MON on the registry&apos;s chain; on Monad testnet the <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">faucet</a> sends it. Before sending, the SDK reads the owner&apos;s balance and the gas estimate. If the owner cannot pay it throws <Link href="/reference/errors/#owner-unfunded"><code>OWNER_UNFUNDED</code></Link> with the address and the shortfall, and nothing is sent. Both calls resolve after a successful receipt, never on an accepted hash alone.
      </p>
    </Doc>
  );
}
