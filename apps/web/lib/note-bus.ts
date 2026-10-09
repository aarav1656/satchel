import type { StoredMemory } from "./demo-store";

export async function publishNotes(notes: StoredMemory[], busUrl: string): Promise<void> {
  const r = await fetch(`${busUrl}/v1/notes`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(notes),
  });
  if (!r.ok) throw new Error(`note bus PUT ${r.status}`);
}

export async function fetchNotes(busUrl: string): Promise<StoredMemory[]> {
  const r = await fetch(`${busUrl}/v1/notes`, { cache: "no-store" });
  if (!r.ok) throw new Error(`note bus GET ${r.status}`);
  const data = (await r.json()) as StoredMemory[];
  return Array.isArray(data) ? data : [];
}
