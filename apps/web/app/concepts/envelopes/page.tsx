import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Envelopes" };

export default function Page() {
  return (
    <Doc>
      <h1>Envelopes</h1>
      <p>What a sealed record is, byte by byte, and how a second passkey opens the same vault.</p>

      <h2 id="sealed">The sealed record</h2>
      <CodeBlock
        lang="text"
        file="SAT1 layout"
        code={`offset  size  field
0       4     magic "SAT1"
4       1     version (1)
5       32    nsHash: keccak256("satchel/ns/" + path)
37      8     epoch, big endian
45      12    IV, random
57      n+16  AES-256-GCM ciphertext and tag
AAD = bytes 0 to 56 (the whole header)`}
      />
      <p>
        The header is plain on purpose. Routing a blob to a namespace, showing its epoch and refusing a foreign blob all happen without a key. Because the header is the authenticated data, changing any header byte makes decryption fail. The path itself is never in the bytes, only its hash. <Link href="/reference/api/#parsesealed">parseSealed</Link> reads the header.
      </p>

      <h2 id="epoch-key">Which key encrypts</h2>
      <p>
        The data key for a record is derived from the namespace key and the epoch: <code>HKDF(nsKey, info &quot;satchel/dek/&quot; + epoch)</code>. A new epoch is a new key. <Link href="/concepts/grants-and-epochs/">Grants and epochs</Link> uses that to revoke.
      </p>

      <h2 id="second-passkey">A second passkey</h2>
      <p>
        <code>addPasskey()</code> creates another passkey and encrypts the root with a key derived from that passkey&apos;s own PRF output, with the rpId and credential id as authenticated data. The wrapped root goes to the <code>Store</code> you pass (IndexedDB by default). Opening with the second passkey unwraps the same root, so every namespace and every fingerprint is identical under either passkey.
      </p>
      <p>
        The store holds ciphertext only. A vault that must open on a device that has never seen this browser needs a store both can reach, which is why <code>Store</code> is a two method interface rather than a fixed location.
      </p>
    </Doc>
  );
}
