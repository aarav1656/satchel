import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { integration } from "@/lib/integrations";

export const metadata: Metadata = { title: "Migrate from per-note vaults" };

const DIFF = `--- a/web/src/lib/sealed.ts
+++ b/web/src/lib/sealed.ts
@@
-import {
-  createSecretVaultWithExistingPasskey, decryptSecretVaultWithPasskey, isMeraError, parseSecretVault,
-  type PasskeySecretVault,
-} from "@category-labs/mera";
+import { open, ns, parseSealed, SatchelError, type Sealed, type Satchel } from "@satchel/sdk";
@@
-export type Sealed = { kind: Kind; by: string; at: number; vault: PasskeySecretVault | null; index: number };
+export type Note = { kind: Kind; by: string; at: number; vault: Sealed | null; index: number };
+const NOTES = ns("trustset/notes");
+let session: Promise<Satchel> | undefined;
+const satchel = () => (session ??= open({ rpId: location.hostname }));   // one prompt per session
@@ readNotes
-    try { vault = parseSecretVault(JSON.parse(dec.decode(ethers.getBytes(r.vault)))); } catch { /* unreadable, shown as such */ }
+    try { vault = parseSealed(ethers.getBytes(r.vault)); } catch { /* unreadable, shown as such */ }
@@ sealNote
-  const secret = enc.encode(text);
-  const vault = await createSecretVaultWithExistingPasskey({ rpId: location.hostname, secret });
-  const bytes = enc.encode(JSON.stringify(vault));
+  const bytes = (await (await satchel()).seal(NOTES, text)).toBytes();
@@ openNote
-export async function openNote(vault: PasskeySecretVault): Promise<string> {
-  const out = await decryptSecretVaultWithPasskey({ rpId: location.hostname, vault });
-  const text = dec.decode(out as Uint8Array);
-  (out as Uint8Array).fill(0);
-  return text;
-}
+export async function openNote(vault: Sealed): Promise<string> {
+  return dec.decode(await (await satchel()).unseal(NOTES, vault));
+}
@@ explainSeal
-  if (isMeraError(e)) {
-    if (e.code === "PRF_UNAVAILABLE") return "This passkey cannot derive keys. iCloud Keychain and Google Password Manager passkeys can; some security keys cannot.";
-    if (e.code === "DECRYPT_FAILED") return "That passkey is not the one this note was sealed with.";
-    if (e.code === "PASSKEY_OPERATION_FAILED") return "The passkey prompt was closed, or there is no trustset passkey on this device yet.";
-    return e.message;
-  }
+  if (e instanceof SatchelError) return \`\${e.message} \${e.fix}\`;`;

const RESEAL = `import { decryptSecretVaultWithPasskey, parseSecretVault } from "@category-labs/mera";
import { ns, type Satchel } from "@satchel/sdk";

const NOTES = ns("trustset/notes");

/** Reads every legacy Mera vault once, then seals the plaintext under the namespace. */
export async function resealLegacy(s: Satchel, legacy: Uint8Array[]): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for (const raw of legacy) {
    const vault = parseSecretVault(JSON.parse(new TextDecoder().decode(raw)));
    const plain = await decryptSecretVaultWithPasskey({ rpId: location.hostname, vault });
    out.push((await s.seal(NOTES, plain)).toBytes());
    plain.fill(0);
  }
  return out;
}`;

export default function Page() {
  const trustset = integration("trustset");
  return (
    <Doc>
      <h1>Migrate from per-note vaults</h1>
      <p>
        trustset seals each note in its own Mera vault, so reading six notes is six passkey prompts. Moving that one file to a satchel namespace makes it one prompt per session, and the contract, the ABI and the on-chain bytes layout around it stay.
      </p>

      <h2 id="before">What changes for the user</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Action</th><th>Per-note Mera vault</th><th>One satchel session</th></tr>
          </thead>
          <tbody>
            <tr><td>Open six notes</td><td>six prompts</td><td>one prompt</td></tr>
            <tr><td>Seal a note</td><td>one prompt each</td><td>no prompt after the session opens</td></tr>
            <tr><td>Error text</td><td>three hand-written strings</td><td><code>SatchelError</code> carries message and fix</td></tr>
          </tbody>
        </table>
      </div>

      <h2 id="diff">The diff</h2>
      <p>
        One file, <code>web/src/lib/sealed.ts</code> in Silk-Nodes/trustset. The Notes contract, <code>NOTES_ABI</code> and the <code>Kind</code> type are untouched.
      </p>
      <CodeBlock lang="diff" file="web/src/lib/sealed.ts" code={DIFF} />

      <h2 id="what-stays">What stays and what goes</h2>
      <ul>
        <li>Stays: the contract, the ABI, the <code>Kind</code> type, the bytes stored on chain per note.</li>
        <li>Goes: the JSON round trip of the vault and the three hand-written error strings. <Link href="/reference/api/#satchelerror">SatchelError</Link> carries the message and the fix.</li>
        <li>Namespace: one string, <code>trustset/notes</code>. A second feature that needs state is another <code>ns()</code> and no second prompt.</li>
      </ul>

      <h2 id="legacy">Notes already sealed as Mera vaults</h2>
      <p>
        Notes sealed before the change stay readable through the old call path until they are re-sealed. <code>resealLegacy</code> does it in one pass: each legacy vault is opened once, then sealed under the namespace.
      </p>
      <CodeBlock file="resealLegacy.ts" code={RESEAL} />
      <Callout tone="warn">
        <p>Each legacy vault still costs one prompt to open, once. After that the note is a satchel blob and never costs another.</p>
      </Callout>

      {trustset && (
        <>
          <h2 id="applied">The applied change</h2>
          <p>
            The patch applied to a trustset checkout, with its build log, is in <a href={trustset.href}>integrations/trustset</a>.
          </p>
        </>
      )}
    </Doc>
  );
}
