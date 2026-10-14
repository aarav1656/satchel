import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Callout, Doc } from "@/components/Doc";
import { REGISTRY_ADDRESS } from "@/lib/config";

export const metadata: Metadata = { title: "Pip on Qwen 3.8 Max" };

const SERVER = `// api/chat.ts: Pip is an agent with one tool. Qwen decides which facts are worth keeping.
const remember = tool({
  description: "Keep one durable fact about the person in their sealed memory.",
  inputSchema: factSchema,                              // { fact }: 2 to 200 characters
  execute: async ({ fact }) => (known(fact) ? "already remembered" : (remembered.push(fact), "remembered")),
});

const result = await generateText({
  model: openrouter("qwen/qwen3.8-max-0902"),
  system: withMemories(PIP_SYSTEM, input.memories),   // memories this browser unsealed itself
  messages: input.messages,
  tools: { remember },
  stopWhen: stepCountIs(3),                            // decide, call the tool, then answer
});
return json({ reply: result.text, remembered });`;

const BROWSER = `// lib/memory.ts: every fact Qwen chose is sealed in the browser before it is stored.
const sealed = await s.seal(ns("memory/assistant"), { text, at });
store.add({ id, at, hex: toHex(sealed.toBytes()) });   // the store only ever sees ciphertext`;

export default function Page() {
  return (
    <Doc>
      <h1>Pip on Qwen 3.8 Max</h1>
      <p>
        Pip is the assistant in the satchel demo. It runs on Qwen 3.8 Max, and Qwen does more than answer: on every turn it decides which things you said are lasting facts about you, calls a tool to keep each one, and then answers using everything it already knows. Those facts end up sealed under a key that only your passkey can derive, and you can hand them to a second app on Monad and take them back later.
      </p>

      <h2 id="loop">The agent loop</h2>
      <p>
        Pip gets one tool, <code>remember</code>, and up to three steps. Qwen reads the conversation plus the memories already unsealed in your browser, works out what is durable (a diet, a home airport, an allergy) and what is a one-off request, calls <code>remember</code> once per new fact, and only then writes the reply. A fact already in memory comes back from the tool as <code>already remembered</code>, so asking the same thing twice never fills the vault with duplicates.
      </p>
      <CodeBlock file="api/chat.ts" code={SERVER} />
      <p>
        The function is stateless. It sees the memories for the length of one call, because your browser unsealed them and sent them along, and it returns the facts Qwen chose. Nothing is written server side.
      </p>

      <h2 id="seal">What happens to a remembered fact</h2>
      <p>
        Back in the browser, each fact is sealed with the key for the <code>memory/assistant</code> namespace, which satchel derives from your passkey&apos;s PRF output. The store holds ciphertext rows with a plain epoch header. A second app such as <Link href="/fern/">Fern</Link> can read them only after Pip writes a grant to the registry on Monad at <code>{REGISTRY_ADDRESS}</code>, and a revoke rotates the epoch so the old grant opens nothing new.
      </p>
      <CodeBlock file="apps/web/lib/memory.ts" code={BROWSER} />

      <h2 id="example">One real turn</h2>
      <p>Sent to the live deployment on 14 October 2026, with an empty memory:</p>
      <Callout>
        <p>
          <strong>You:</strong> I am vegetarian and I usually fly out of Bengaluru. What should I pack for a weekend in Goa?
        </p>
        <p>
          <strong>Pip (qwen/qwen3.8-max-0902):</strong> Kept: you&apos;re vegetarian and usually fly out of Bengaluru. Then a packing list with a veg-friendly section (&quot;Confirm veg-only at beach shacks; ask for no fish sauce in curries&quot;) and a BLR section on cabin liquids and web check-in.
        </p>
        <p>
          <strong>Tool calls:</strong> <code>remember(&quot;Vegetarian&quot;)</code>, <code>remember(&quot;Usually flies out of BLR (Bengaluru)&quot;)</code>. The question about Goa was not kept, which is right: it was a request, not a fact about the person.
        </p>
      </Callout>

      <h2 id="why-qwen">Why Qwen for this job</h2>
      <p>
        The hard part of an assistant with memory isn&apos;t storage; it&apos;s judgment about what deserves to be stored, because every kept fact becomes something the person may later grant to another app. Qwen 3.8 Max makes that call reliably inside a tool loop: it separates the request from the facts in the same sentence, phrases each fact as a short plain statement that reads well when Fern sees it, and confirms in one line what it kept so the person always knows what went into their vault. It also uses the existing memories without being asked, which is the whole point of a memory that travels.
      </p>
      <p>
        Pip asks OpenRouter for Qwen first, and the deployment reads the answering model back from every response, so the reply above is attributable to Qwen and not to a fallback.
      </p>

      <h2 id="try">Try it</h2>
      <p>
        Open <Link href="/pip/">Pip</Link>, sign in with a passkey, and tell it something about yourself. Then allow Fern on the Sharing page and ask Fern to plan a weekend. The guide <Link href="/guides/fern-on-kimi/">Fern on Kimi</Link> covers the other side.
      </p>
    </Doc>
  );
}
