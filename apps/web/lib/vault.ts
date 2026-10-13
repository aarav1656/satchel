"use client";

import { useSyncExternalStore } from "react";
import "./prompts";
import { enrol, open, parseSealed, type Satchel } from "satchel-sdk";
import { toBytes } from "viem";
import { credential, memories, owner } from "./demo-store";
import { MEMORY_NS, NOTE_BUS_URL, REGISTRY } from "./config";
import { EpochBehind, resealAll, sealFact } from "./memory";
import { publishNotes } from "./note-bus";

/** Pip's session. It lives in module memory: a client-side navigation keeps it, a reload closes it and the next action asks for the passkey again. */
let session: Satchel | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getSession = () => session;
export const useSession = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
    () => undefined,
  );

const rpId = () => location.hostname;

export async function createVault(): Promise<Satchel> {
  session?.close();
  session = await enrol({ rpId: rpId(), appName: "Satchel vault for Pip", registry: REGISTRY });
  if (session.credential) credential.set({ credentialId: session.credential.credentialId, ...(session.credential.transports ? { transports: [...session.credential.transports] } : {}) });
  owner.set(session.registryOwner);
  emit();
  return session;
}

export async function openVault(): Promise<Satchel> {
  if (session) return session;
  const stored = credential.get();
  session = await open({
    rpId: rpId(),
    registry: REGISTRY,
    ...(stored ? { credential: stored as NonNullable<Satchel["credential"]> } : {}),
  });
  owner.set(session.registryOwner);
  emit();
  return session;
}

/** Wraps this vault's root to a second passkey, one prompt (a new passkey is created). Either passkey then opens the vault on this device. */
export async function addSecondPasskey(): Promise<void> {
  const s = session ?? (await openVault());
  await s.addPasskey({ appName: "Satchel vault for Pip" });
}

/** Opens the vault with a passkey added by addSecondPasskey(); NO_SECOND_PASSKEY if the one the person picks was never added. */
export async function openVaultWithSecondPasskey(): Promise<Satchel> {
  session?.close();
  session = await open({ rpId: rpId(), registry: REGISTRY, recover: true });
  owner.set(session.registryOwner);
  emit();
  return session;
}

export function closeVault(): void {
  session?.close();
  session = undefined;
  emit();
}

/** Seals `text` under the memory namespace and stores the ciphertext (page storage, and the note bus when one is set). */
export async function saveMemory(text: string) {
  const s = session ?? (await openVault());
  const out = await sealFact(s, text, memories);
  if (NOTE_BUS_URL) await publishNotes(memories.list(), NOTE_BUS_URL);
  return out;
}

/** The revoke step that makes Fern forget: every stored memory is sealed again at the namespace's new epoch. */
export async function resealMemories(minEpoch: number) {
  const s = session ?? (await openVault());
  for (let attempt = 0; ; attempt++) {
    try {
      const out = await resealAll(s, memories, minEpoch);
      if (NOTE_BUS_URL) await publishNotes(memories.list(), NOTE_BUS_URL);
      return out;
    } catch (e) {
      // the node behind the RPC can trail the receipt by a block or two; nothing was replaced, so waiting and retrying is safe
      if (!(e instanceof EpochBehind) || attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

export const describeSealed = (hex: `0x${string}`) => {
  const bytes = toBytes(hex);
  const head = parseSealed(bytes);
  return { epoch: head.epoch, size: bytes.length, bytes };
};
