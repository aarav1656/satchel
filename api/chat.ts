import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { FERN_SYSTEM, LIMITS, originAllowed, parseChat, PIP_SYSTEM, rateLimited, withMemories } from "./_chat-input";

/** Through Vercel AI Gateway. On Vercel the project's OIDC token authenticates it, so no provider key exists in this repo. */
const MODEL = "anthropic/claude-haiku-4.5";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request.headers.get("origin"))) return json({ error: "origin_not_allowed" }, 403);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return json({ error: "rate_limited", message: "Too many requests. Wait a minute." }, 429);

  const text = await request.text();
  if (text.length > LIMITS.body) return json({ error: "too_large", message: `Request is over ${LIMITS.body} characters.` }, 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: "bad_request", message: "Body is not JSON." }, 400);
  }
  const input = parseChat(raw);
  if (typeof input === "string") return json({ error: "bad_request", message: input }, 400);

  const remembered: string[] = [];
  const remember = tool({
    description: "Keep one durable fact about the person in their sealed memory.",
    inputSchema: z.object({ fact: z.string().min(2).max(200).describe("A short plain statement of the fact") }),
    execute: async ({ fact }) => {
      const clean = fact.trim();
      const known = [...input.memories, ...remembered].some((m) => m.toLowerCase() === clean.toLowerCase());
      if (known) return "already remembered";
      if (remembered.length < 5) remembered.push(clean);
      return "remembered";
    },
  });

  try {
    const result = await generateText({
      model: MODEL,
      system: withMemories(input.app === "pip" ? PIP_SYSTEM : FERN_SYSTEM, input.memories),
      messages: input.messages,
      maxOutputTokens: 500,
      ...(input.app === "pip" ? { tools: { remember }, stopWhen: stepCountIs(3) } : {}),
    });
    return json({ reply: result.text.trim(), remembered, model: MODEL });
  } catch (e) {
    // AI Gateway and provider errors both carry the HTTP status they got (402 or 403 when the team has no credits).
    const status = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? (e as { statusCode: number }).statusCode : undefined;
    if (status !== undefined) {
      const message = e instanceof Error ? e.message.slice(0, 300) : "rejected";
      console.error(`ai gateway ${status}: ${message}`);
      return json({ error: "gateway_rejected", status, message }, 502);
    }
    console.error(`chat failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown"}`);
    return json({ error: "chat_failed", message: "The assistant could not answer." }, 500);
  }
}
