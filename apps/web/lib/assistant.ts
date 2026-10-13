import { CHAT_URL } from "./config";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export class ChatError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * One call to the chat function. `memories` are plaintext this browser unsealed itself; the function holds none of them
 * after it answers. Pip also gets back the facts the model chose to keep, which the caller seals.
 */
export async function ask(app: "pip" | "fern", messages: Turn[], memories: string[]): Promise<{ reply: string; remembered: string[] }> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ app, messages: messages.slice(-10), memories: memories.slice(0, 40) }) });
  } catch {
    throw new ChatError("The assistant could not be reached. Check your connection and try again.", "network", 0);
  }
  const body = (await res.json().catch(() => ({}))) as { reply?: string; remembered?: string[]; error?: string; message?: string };
  if (!res.ok || typeof body.reply !== "string") {
    throw new ChatError(body.message ?? "The assistant could not answer.", body.error ?? "chat_failed", res.status);
  }
  return { reply: body.reply, remembered: body.remembered ?? [] };
}
