import { ns, parseSealed, type Satchel } from "satchel-sdk";
import { toBytes } from "viem";
import { MEMORY_NS, NOTE_BUS_URL } from "./config";
import { fetchNotes } from "./note-bus";

/** Owner path: decrypt trading notes published to the bus (no grant). Used by a second client with the same passkey. */
export async function unsealTradingNotesFromBus(session: Satchel): Promise<{ id: string; text: string; epoch: number }[]> {
  if (!NOTE_BUS_URL) return [];
  const n = ns(MEMORY_NS);
  const out: { id: string; text: string; epoch: number }[] = [];
  for (const m of await fetchNotes(NOTE_BUS_URL)) {
    const bytes = toBytes(m.hex);
    const body = await session.unsealJson<{ text: string; at?: number }>(n, bytes);
    out.push({ id: m.id, text: body.text, epoch: parseSealed(bytes).epoch });
  }
  return out;
}
