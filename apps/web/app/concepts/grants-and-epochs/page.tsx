import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { REGISTRY_ADDRESS } from "@/lib/config";

export const metadata: Metadata = { title: "Grants and epochs" };

export default function Page() {
  return (
    <Doc>
      <h1>Grants and epochs</h1>
      <p>A grant gives one app a key to one namespace. Revoking moves the namespace to a new epoch, so nothing sealed afterwards opens for that app.</p>

      <h2 id="grant">Grant</h2>
      <p>
        The reading app calls <Link href="/reference/api/#creategrantee">createGrantee()</Link>, which generates a P-256 key pair and never touches the passkey. Its public key travels to the owner over any channel. <code>s.grant(ns, publicKey, {"{"} label {"}"})</code> wraps the namespace&apos;s current epoch key to that public key with HPKE (RFC 9180, DHKEM P-256, HKDF-SHA256, AES-128-GCM) and records the grant in the registry. The wrapped key is also in the transaction&apos;s <code>Granted</code> event.
      </p>

      <h2 id="epoch">Epoch</h2>
      <p>
        The registry stores one counter per owner and namespace hash. <code>seal()</code> reads it and encrypts under that epoch&apos;s key. <code>revoke()</code> deactivates the grant and increments the counter in one transaction.
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

      <h2 id="owner">Who pays</h2>
      <p>
        The registry owner is an EOA derived from the passkey root (<code>s.registryOwner</code>). It sends <code>grant</code> and <code>revoke</code>, so it needs a little MON on the registry&apos;s chain. Both calls resolve after a successful receipt, never on an accepted hash alone.
      </p>
    </Doc>
  );
}
