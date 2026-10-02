import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { QuickstartRun } from "@/components/QuickstartRun";
import { REGISTRY_ADDRESS } from "@/lib/config";

const FIRST = `import { open, ns } from "@satchel/sdk";

const s = await open({ rpId: location.hostname });          // one passkey prompt
const memory = ns("memory/assistant");
const blob = await s.seal(memory, { likes: "metric units" }); // Sealed, safe to store anywhere
const back = await s.unsealJson<{ likes: string }>(memory, blob);`;

const SECOND = `const notes = ns("memory/notes");
const note = await s.seal(notes, "call the dentist");   // a new folder, no second prompt
await s.fingerprint(notes);                              // b4e6cf3b, equal on every device with this passkey`;

const GRANT = `import { createGrantee } from "@satchel/sdk";

// In the other app. It holds its own key and never touches the passkey.
const fern = await createGrantee();
// fern.publicKey goes to the owner over any channel.

// In the app that holds the passkey, opened with a registry:
const s = await open({ rpId: location.hostname, registry: { address: "${REGISTRY_ADDRESS}" } });
const grant = await s.grant(memory, fern.publicKey, { label: "Fern" });   // one Monad transaction
await fern.reader(grant).unsealJson(blob);                                 // Fern reads
await s.revoke(memory, grant.id);                                          // epoch 1 to 2, one Monad transaction`;

export default function Page() {
  return (
    <Doc>
      <h1>Quickstart</h1>
      <p>Five lines to a sealed, reopened record. One passkey prompt, then any number of namespaces without another.</p>

      <h2 id="seal">Seal and reopen</h2>
      <CodeBlock code={FIRST} file="quickstart.ts" />
      <QuickstartRun />
      <p>
        The passkey needs the WebAuthn PRF extension: iCloud Keychain, Google Password Manager, Windows Hello, 1Password, Proton Pass and YubiKey 5 have it. Run the same five lines in this page, against this site&apos;s own passkey. The first run creates the passkey, later runs reuse it.
      </p>

      <h2 id="install">Install</h2>
      <CodeBlock lang="sh" file="terminal" code={"npm i @satchel/sdk @category-labs/mera@0.2.0"} />

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
      <CodeBlock code={SECOND} file="quickstart.ts" />
      <p>
        Both namespaces come from the same passkey output through HKDF with different info strings, so the second one asks for nothing. <Link href="/concepts/namespaces/">Namespaces</Link> says how.
      </p>

      <h2 id="grant">Give another app a key, then take it back</h2>
      <CodeBlock code={GRANT} file="grant.ts" />
      <Callout>
        <p>
          <code>grant</code> and <code>revoke</code> are transactions on the registry, sent from <code>s.registryOwner</code>, an address derived from your passkey. Sealing and reading need no MON. The live version of exactly this is the demo: <Link href="/pip/">Pip</Link> holds the passkey and <Link href="/fern/">Fern</Link> reads through the grant.
        </p>
      </Callout>

      <h2 id="next">Next</h2>
      <ul>
        <li><Link href="/concepts/passkey-and-prf/">Passkey and PRF</Link>, why the raw output is never a cipher key.</li>
        <li><Link href="/reference/api/">API reference</Link>, every export with its Throws line.</li>
        <li><Link href="/guides/migrate-from-hkdf/">Migrate from per-note vaults</Link>, one file in trustset, six prompts to one.</li>
        <li><Link href="/proof/">Proof</Link>, the four things a judge can click.</li>
      </ul>
    </Doc>
  );
}
