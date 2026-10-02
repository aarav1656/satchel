import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { REGISTRY_ADDRESS } from "@/lib/config";
import { STORAGE } from "@/lib/demo-store";

export const metadata: Metadata = { title: "Two apps" };

const OWNER = `import { openOrEnrol, ns } from "satchel-sdk";

const registry = { address: "${REGISTRY_ADDRESS}" };
const memory = ns("memory/assistant");
const s = await openOrEnrol({ rpId: "pip.example", appName: "Pip", registry, mode: "enrol" });   // mode matters on a first visit only

// What B sent: the publicKey from its createGrantee(). A public key, safe in a URL.
const publicKeyFromB = "0x04...";

// 1. The grant. One Monad transaction; its hash is everything B needs.
const grant = await s.grant(memory, publicKeyFromB, { label: "Fern" });
const link = \`https://fern.example/connect?grant=\${grant.txHash}\`;   // or a QR code of the same string, or any message

// 2. The sealed bytes. Ciphertext, so any store that B can read from will do.
const blob = await s.seal(memory, { likes: "metric units" });
await fetch("https://pip.example/api/memories/1", { method: "PUT", body: blob.toBytes() });`;

const READER = `import { createGrantee, fetchGrant, ns, parseSealed } from "satchel-sdk";

const registry = { address: "${REGISTRY_ADDRESS}" };
const b = await createGrantee();   // B's own key. b.publicKey is what B sent to A.

// (a) The grant, rebuilt from the transaction hash in the link.
const txHash = new URL(location.href).searchParams.get("grant") as \`0x\${string}\`;
const grant = await fetchGrant({ txHash, registry, ns: ns("memory/assistant") });
const reader = b.reader(grant);

// (b) The sealed bytes, from wherever A put them.
const res = await fetch("https://pip.example/api/memories/1");
const bytes = new Uint8Array(await res.arrayBuffer());

parseSealed(bytes).epoch;          // 1, read from the header without a key
await reader.unsealJson(bytes);    // { likes: "metric units" }`;

const KEEP = `// B keeps its identity across visits: persist the key pair, pass it back in.
const stored = await idbGet("grantee");           // B's own IndexedDB
const b = await createGrantee(stored);            // omit stored on the first run
if (!stored) await idbPut("grantee", b.keyPair);  // a non-extractable CryptoKeyPair is storable`;

export default function Page() {
  return (
    <Doc>
      <h1>Two apps</h1>
      <p>
        App A holds the passkey. App B is on another origin and never sees it. Three things cross between them and none is secret: B&apos;s public key, the grant, and the sealed bytes.
      </p>

      <h2 id="flow">What crosses and which way</h2>
      <ol>
        <li>B makes a key with <Link href="/reference/api/#creategrantee">createGrantee()</Link> and sends A the <code>publicKey</code>.</li>
        <li>A calls <code>s.grant()</code> and sends B the transaction hash it returns as <code>txHash</code>.</li>
        <li>A puts the sealed bytes in a store B can read, and B fetches them.</li>
      </ol>
      <CodeBlock file="app A, the owner" code={OWNER} />
      <CodeBlock file="app B, the reader" code={READER} />

      <h2 id="grant">The grant, by transaction hash</h2>
      <p>
        <Link href="/reference/api/#fetchgrant">fetchGrant</Link> reads the <code>Granted</code> event out of that one transaction&apos;s receipt and returns a Grant B can use with its own key. It is a receipt lookup, never an <code>eth_getLogs</code> range scan, which Monad&apos;s public RPC caps at 100 blocks, so it works for a grant from any block. The hash can travel any way a short string can: a URL query, a QR code, a message, a row in A&apos;s backend. B checks nothing on trust. The wrapped key inside the event opens only with B&apos;s own private key, so a hash handed to the wrong app fails at <code>reader()</code> with <Link href="/reference/errors/#grant-not-for-key">GRANT_NOT_FOR_KEY</Link>, and a hash from another registry or a reverted transaction fails in <code>fetchGrant</code> with <Link href="/reference/errors/#registry-unreachable">REGISTRY_UNREACHABLE</Link>.
      </p>
      <p>
        The chain holds the namespace as a hash only. B passes <code>ns</code> when it knows the path, and <code>fetchGrant</code> checks it against the hash in the event (<Link href="/reference/errors/#namespace-mismatch">NAMESPACE_MISMATCH</Link> if they differ); without it the Grant has no <code>ns</code> and works the same.
      </p>
      <CodeBlock file="app B, keeping its key" code={KEEP} />

      <h2 id="blobs">The sealed bytes, from any store</h2>
      <p>
        A sealed record is ciphertext with a plain header, so it can sit anywhere a public string of bytes can. A has three ordinary choices, and B reads the same bytes back from whichever it picked:
      </p>
      <ul>
        <li>A&apos;s own backend: <code>PUT</code> the bytes, B <code>GET</code>s them, as in the code above.</li>
        <li>IPFS: pin the bytes, send B the CID, B reads <code>https://&lt;gateway&gt;/ipfs/&lt;cid&gt;</code>.</li>
        <li>A plain URL: any static host or bucket that serves the file.</li>
      </ul>
      <p>
        When B holds more than one grant, <code>parseSealed(bytes).epoch</code> says which grant to use for a record: the one issued at that epoch. A record from a later epoch than every grant B holds is the signal to ask A for a fresh grant (<Link href="/concepts/grants-and-epochs/#revoke-all">regrant</Link>) and to fetch it by its new hash.
      </p>

      <h2 id="demo">What the demo does</h2>
      <Callout>
        <p>
          <Link href="/pip/">Pip</Link> and <Link href="/fern/">Fern</Link> are two routes of one site, so they share one browser origin. Fern gets its grant the way this page describes: Pip&apos;s Sharing page returns Fern to <code>/fern/?grant=&lt;txHash&gt;</code> and Fern rebuilds the grant with <code>fetchGrant</code>; it keeps only that hash, in {STORAGE.fernGrants}. The sealed memories take the one shortcut the shared origin allows: Fern reads the ciphertext Pip wrote to {STORAGE.memories}. On two origins that line becomes a <code>fetch</code> from A&apos;s backend, IPFS or a URL, and nothing else changes.
        </p>
      </Callout>
    </Doc>
  );
}
