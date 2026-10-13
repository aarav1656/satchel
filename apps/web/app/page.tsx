import Link from "next/link";
import { HomeStage } from "@/components/HomeStage";
import { REGISTRY_ADDRESS } from "@/lib/config";

export default function Page() {
  return (
    <main className="home">
      <section className="home-hero">
        <h1>Your assistant&apos;s memory, sealed to your passkey.</h1>
        <p>You choose which apps read it, and revoke ends it.</p>
      </section>

      <HomeStage />

      <section className="minute" aria-labelledby="minute-h">
        <h2 id="minute-h">One minute with both</h2>
        <ol>
          <li>
            <strong>Tell Pip two things that last.</strong>
            <span>
              &ldquo;I&apos;m vegetarian.&rdquo; &ldquo;I fly out of BLR.&rdquo; Each one is sealed with your passkey and shown with its epoch and fingerprint. <Link href="/pip/">Open Pip</Link>
            </span>
          </li>
          <li>
            <strong>Allow Fern.</strong>
            <span>One passkey prompt and one transaction on Monad. Fern gets its own key to that folder, read only.</span>
          </li>
          <li>
            <strong>Ask Fern to plan your weekend.</strong>
            <span>
              It opens the memories and plans around them: vegetarian, out of BLR. <Link href="/fern/">Open Fern</Link>
            </span>
          </li>
          <li>
            <strong>Revoke Fern.</strong>
            <span>Pip seals every memory again at the next epoch. Fern&apos;s next read comes back GRANT_REVOKED and it plans without them.</span>
          </li>
        </ol>
      </section>

      <section className="home-built">
        <p>
          Both apps are built on <code>satchel-sdk</code>: one passkey, a key per namespace, and read grants that end on a transaction. Registry <code className="mono">{REGISTRY_ADDRESS}</code> on Monad testnet.
        </p>
        <p>
          <Link href="/docs/">Read the quickstart</Link>, or <Link href="/proof/">see the recorded runs</Link>.
        </p>
      </section>
    </main>
  );
}
