import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";

export const metadata: Metadata = { title: "Passkey and PRF" };

export default function Page() {
  return (
    <Doc>
      <h1>Passkey and PRF</h1>
      <p>One passkey ceremony yields one 32 byte secret. Everything else in satchel is derived from it and nothing derived is stored.</p>

      <h2 id="prf">What the passkey gives you</h2>
      <p>
        The WebAuthn PRF extension lets a relying party ask an authenticator for a pseudo-random value that only that credential can compute for a given input. Satchel asks once per session, through Mera&apos;s <code>getPasskeyPrfOutput</code> or <code>createPasskeyWithPrfOutput</code>, and holds the 32 byte result as the root in memory.
      </p>
      <CodeBlock
        lang="text"
        file="derivation"
        code={`root      = PRF output, 32 bytes, from the passkey
nsKey     = HKDF-SHA-256(root,  salt "satchel/v1", info "satchel/ns/" + path)
dataKey   = HKDF-SHA-256(nsKey, salt "satchel/v1", info "satchel/dek/" + epoch)
owner key = HKDF-SHA-256(root,  salt "satchel/v1", info "satchel/owner/secp256k1")`}
      />

      <h2 id="never-raw">Why the raw output is never a cipher key</h2>
      <p>
        A raw PRF output used directly as an AES key would be the same key for every app and every record, and it would be the same bytes a wallet derivation might reuse. Passing it through HKDF with a distinct info string per purpose gives each purpose its own independent key, and a leak of one derived key says nothing about the root or its siblings.
      </p>

      <h2 id="not-stored">What is stored</h2>
      <p>
        The root exists in memory between <code>open()</code> and <code>close()</code>. Derived keys are computed on demand and zeroed after use. Browser storage holds ciphertext and a public credential id, which <code>openOrEnrol</code> remembers so a later visit is one prompt. The <Link href="/proof/">proof page</Link> scans localStorage, sessionStorage, IndexedDB and cookies in your own browser and flags any value that is neither.
      </p>

      <h2 id="support">Which passkeys work</h2>
      <p>
        Which authenticators expose PRF differs by platform and changes over time, so satchel does not keep its own list. A passkey without PRF makes <code>open()</code> throw <Link href="/reference/errors/#prf-unavailable"><code>PRF_UNAVAILABLE</code></Link>, with the authenticators known to work in the fix text, instead of guessing at a key.
      </p>

      <Callout>
        <p>A person holding the passkey holds every namespace under it. Namespaces separate apps and data from each other; the passkey is the root.</p>
      </Callout>
    </Doc>
  );
}
