import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { FERN_SYSTEM, LIMITS, originAllowed, parseChat, PIP_SYSTEM, rateLimited, withMemories } from "./_chat-input.js";

/** OpenRouter tries each model in order and answers from the first one that is up; all support tool calls.
 *  Pip runs on Qwen 3.8 Max (agentic: it decides what to keep with the remember tool). Fern runs on Kimi K2.6.
 *  The free models stay behind them so a provider outage never leaves the apps silent. */
const FREE = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"];
const MODELS = { pip: ["qwen/qwen3.8-max-0902", ...FREE], fern: ["moonshotai/kimi-k2.6", ...FREE] } as const;
const openrouter = createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY });

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

  if (!process.env.OPENROUTER_API_KEY) return json({ error: "not_configured", message: "OPENROUTER_API_KEY is not set on this deployment." }, 503);
  try {
    const result = await generateText({
      model: openrouter(MODELS[input.app === "pip" ? "pip" : "fern"][0]),
      providerOptions: { openrouter: { models: [...MODELS[input.app === "pip" ? "pip" : "fern"]] } },
      system: withMemories(input.app === "pip" ? PIP_SYSTEM : FERN_SYSTEM, input.memories),
      messages: input.messages,
      maxOutputTokens: 2000,
      ...(input.app === "pip" ? { tools: { remember }, stopWhen: stepCountIs(3) } : {}),
    });
    return json({ reply: result.text.trim(), remembered, model: result.response.modelId });
  } catch (e) {
    // OpenRouter errors carry the HTTP status they got (429 when every free model is rate limited).
    const status = typeof (e as { statusCode?: unknown })?.statusCode === "number" ? (e as { statusCode: number }).statusCode : undefined;
    if (status !== undefined) {
      const message = e instanceof Error ? e.message.slice(0, 300) : "rejected";
      console.error(`openrouter ${status}: ${message}`);
      return json({ error: "gateway_rejected", status, message }, 502);
    }
    console.error(`chat failed: ${e instanceof Error ? e.message.slice(0, 300) : "unknown"}`);
    return json({ error: "chat_failed", message: "The assistant could not answer." }, 500);
  }
}
