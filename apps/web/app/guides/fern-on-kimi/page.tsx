import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { REGISTRY_ADDRESS } from "@/lib/config";

export const metadata: Metadata = { title: "Fern on Kimi" };

const READ = `// lib/fern.ts: Fern unseals only what a live grant on Monad opens.
const pick = grantForRecord(mine, parseSealed(bytes).epoch);
if (!pick) rows.push({ state: "locked", code: everGranted ? "GRANT_REVOKED" : "NO_GRANT" });
else rows.push({ state: "open", text: (await fern.reader(pick).unsealJson(bytes)).text });`;

const CALL = `// api/chat.ts: Kimi K2.6 plans from the opened memories and nothing else.
const result = await generateText({
  model: openrouter("moonshotai/kimi-k2.6"),
  providerOptions: { openrouter: { reasoning: { enabled: false } } },
  system: withMemories(FERN_SYSTEM, openedMemories),
  messages: input.messages,
});`;

export default function Page() {
  return (
    <Doc>
      <h1>Fern on Kimi</h1>
      <p>
        Fern is the second app in the satchel demo, a weekend and travel planner that never sees your passkey. It plans on Kimi K2.6, and the only things Kimi knows about you are the memories Pip&apos;s grant on Monad lets Fern open. Revoke the grant and the next plan is made without them.
      </p>

      <h2 id="what-kimi-sees">What Kimi is allowed to see</h2>
      <p>
        Fern rebuilds each grant from its transaction on the registry at <code>{REGISTRY_ADDRESS}</code>, picks the grant that matches each sealed record&apos;s epoch, and opens the record with its own key. Records it can&apos;t open stay locked with a reason (<code>NO_GRANT</code> or <code>GRANT_REVOKED</code>) and never reach the model. So the prompt Kimi gets is, exactly, the set of facts the person allowed.
      </p>
      <CodeBlock file="apps/web/lib/fern.ts" code={READ} />
      <CodeBlock file="api/chat.ts" code={CALL} />

      <h2 id="example">One real plan</h2>
      <p>Sent to the live deployment on 14 October 2026 with the two facts Pip kept:</p>
      <Callout>
        <p>
          <strong>Memories opened by the grant:</strong> Vegetarian. Flies out of BLR (Bengaluru).
        </p>
        <p>
          <strong>You:</strong> Plan me a weekend away.
        </p>
        <p>
          <strong>Fern (moonshotai/kimi-k2.6):</strong> &quot;Since you&apos;re a vegetarian flying out of BLR, I&apos;d suggest a quick flight to Goa for beachside shacks serving excellent veg thalis and coconut-based curries. You can catch early morning flights from Bengaluru and return Sunday evening, making the most of two relaxed days. I used your vegetarian preference and your Bengaluru home airport to shape this plan.&quot;
        </p>
      </Callout>
      <p>
        The last sentence matters. Fern&apos;s instructions ask Kimi to name every memory it used, so the person can check the plan against what they granted. With no memories, Kimi says it can&apos;t see any and asks, rather than guessing a home airport.
      </p>

      <h2 id="why-kimi">Why Kimi for this job</h2>
      <p>
        A planner that reads granted data has to stay inside it. Kimi K2.6 follows the grant boundary as an instruction: it builds the plan out of the opened facts, attributes each one, keeps to three plain sentences, and treats memory text as data rather than as commands, which matters when the memory was written by a different app. With reasoning turned off it answers in 1.3 to 1.9 seconds on the live site (three timed calls on 14 October 2026), fast enough that a revoke on Pip and a fresh question on Fern happen in the same breath.
      </p>

      <h2 id="try">Try it</h2>
      <p>
        In <Link href="/pip/">Pip</Link>, tell it a fact and allow Fern. Ask <Link href="/fern/">Fern</Link> for a plan, then revoke on Pip&apos;s Sharing page and ask again. <Link href="/guides/pip-on-qwen/">Pip on Qwen</Link> covers how the facts get chosen.
      </p>
    </Doc>
  );
}
