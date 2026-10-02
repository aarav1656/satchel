import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { QuickstartRun } from "@/components/QuickstartRun";
import { GRANT_AND_REVOKE, QUICKSTART, SECOND_NAMESPACE } from "@/lib/snippets";

export default function Page() {
  return (
    <Doc>
      <h1>Quickstart</h1>
      <p>Five lines to a sealed, reopened record. One passkey prompt per visit, then any number of namespaces without another.</p>

      <h2 id="seal">Seal and reopen</h2>
      <CodeBlock code={QUICKSTART} file="quickstart.js" snippet="quickstart" />
      <QuickstartRun />
      <p>
        The passkey needs the WebAuthn PRF extension: iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass and YubiKey 5 have it. The buttons run the exact text above, import line included, against this site&apos;s own passkey. <code>openOrEnrol</code> shows one passkey prompt per call, so a first visit asks you which one: <strong>Create a passkey</strong> runs the code with <code>mode</code> set to <code>&quot;enrol&quot;</code>, <strong>I already have one</strong> runs it with <code>&quot;open&quot;</code>, each its own click and its own prompt. Once this browser remembers the passkey there is one button, <strong>Run the code above</strong>, and <code>mode</code> is ignored. If the remembered passkey is gone (deleted, or made on another device), the call forgets it, throws <Link href="/reference/errors/#passkey-not-found">PASSKEY_NOT_FOUND</Link> and both buttons come back. <Link href="/reference/api/#openorenrol">openOrEnrol</Link> lists the order it tries.
      </p>

      <h2 id="install">Install</h2>
      <CodeBlock lang="sh" file="terminal" code={"npm i satchel-sdk @category-labs/mera@0.2.0"} />

      <h2 id="output">What correct looks like</h2>
      <CodeBlock
        lang="text"
        file="console"
        code={`sealed  ns=memory/assistant  epoch=1  97 B  fp=4cda9f4b  (1 prompt)
unsealed  {"likes":"metric units"}`}
      />
      <p>
        97 bytes is 57 bytes of header, 24 bytes of JSON and a 16 byte authentication tag. The fingerprint is yours: it is the same eight characters on every device that holds your passkey, so it doubles as the cross-device check.
      </p>

      <h2 id="second-namespace">A second namespace is one more string</h2>
      <CodeBlock code={SECOND_NAMESPACE} file="quickstart.js, same session" />
      <p>
        Both namespaces come from the same passkey output through HKDF with different info strings, so the second one asks for nothing. <Link href="/concepts/namespaces/">Namespaces</Link> says how.
      </p>

      <h2 id="grant">Give another app a key, then take it back</h2>
      <CodeBlock code={GRANT_AND_REVOKE} file="grant.js" />
      <Callout>
        <p>
          <code>grant</code> and <code>revoke</code> are transactions on the registry, sent from <code>s.registryOwner</code>, an address derived from your passkey. Sealing and reading need no MON, and a send from an unfunded owner stops before it is sent with <Link href="/reference/errors/#owner-unfunded">OWNER_UNFUNDED</Link>, naming the address and the shortfall. Revoking moves the namespace to the next epoch for every reader, so another app that should keep reading new records needs <code>regrant</code>: <Link href="/concepts/grants-and-epochs/#revoke-all">Grants and epochs</Link> has the rule. The live version of exactly this is the demo: <Link href="/pip/">Pip</Link> holds the passkey and <Link href="/fern/">Fern</Link> reads through the grant, which it rebuilds from a transaction hash.
        </p>
      </Callout>

      <h2 id="next">Next</h2>
      <ul>
        <li><Link href="/concepts/passkey-and-prf/">Passkey and PRF</Link>, why the raw output is never a cipher key.</li>
        <li><Link href="/reference/api/">API reference</Link>, every export with its Throws line.</li>
        <li><Link href="/guides/two-apps/">Two apps</Link>, how a second origin gets the grant and the sealed blobs.</li>
        <li><Link href="/guides/migrate-from-per-note-vaults/">Migrate from per-note vaults</Link>, one file in trustset, six prompts to one.</li>
        <li><Link href="/proof/">Proof</Link>, the live checks and the recorded runs behind them.</li>
      </ul>
    </Doc>
  );
}
