import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Doc } from "@/components/Doc";
import { MEMORY_NS } from "@/lib/config";

export const metadata: Metadata = { title: "Namespaces" };

export default function Page() {
  return (
    <Doc>
      <h1>Namespaces</h1>
      <p>A namespace is a path. It is the HKDF info string for a key, the unit of a grant, and the line on the key rail.</p>

      <h2 id="ns">ns()</h2>
      <CodeBlock
        file="namespaces.ts"
        code={`import { ns } from "@satchel/sdk";

const memory = ns("${MEMORY_NS}");   // ok
ns("Memory/Assistant");              // throws INVALID_NAMESPACE: uppercase
ns("memory//assistant");             // throws INVALID_NAMESPACE: empty segment`}
      />
      <p>
        A path is 3 to 64 characters of lowercase letters and digits joined by <code>/</code> or <code>-</code>. <code>ns()</code> returns a branded string, so passing a raw string where a <code>Namespace</code> is expected is a type error. See <Link href="/reference/api/#ns">ns</Link>.
      </p>

      <h2 id="separation">What separates two namespaces</h2>
      <p>
        <code>satchel/ns/memory/assistant</code> and <code>satchel/ns/memory/notes</code> are different HKDF info strings, so they derive unrelated keys from the same passkey output. A record sealed under one opens under the other zero times: its header carries the keccak256 hash of the info string, and <code>unseal</code> compares it with the namespace you asked for before decrypting. The mismatch is a named error, <Link href="/reference/errors/#namespace-mismatch"><code>NAMESPACE_MISMATCH</code></Link>, not a decryption failure. The <Link href="/proof/">proof page</Link> triggers it from a real wrong-namespace call.
      </p>

      <h2 id="owns">What each app owns</h2>
      <p>One convention keeps apps from colliding: the first segment is the app or domain, the rest names the data.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Namespace</th><th>Owned by</th><th>Holds</th></tr>
          </thead>
          <tbody>
            <tr><td><code>memory/assistant</code></td><td>Pip, readable by Fern through a grant</td><td>what the assistant remembers about you</td></tr>
            <tr><td><code>memory/notes</code></td><td>Pip</td><td>a second folder under the same passkey, used on the proof page</td></tr>
            <tr><td><code>trustset/notes</code></td><td>trustset</td><td>sealed notes, see the <Link href="/guides/migrate-from-hkdf/">migration guide</Link></td></tr>
          </tbody>
        </table>
      </div>

      <h2 id="fingerprint">Fingerprints</h2>
      <p>
        <code>fingerprint(ns)</code> returns eight hex characters of SHA-256 over a fixed label and the namespace key. It is safe to show and compare: two devices that hold the same passkey print the same value for the same namespace.
      </p>
    </Doc>
  );
}
