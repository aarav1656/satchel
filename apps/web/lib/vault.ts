"use client";

import { useSyncExternalStore } from "react";
import "./prompts";
import { enrol, open, ns, parseSealed, type Satchel } from "satchel-sdk";
import { toBytes, toHex } from "viem";
import { credential, memories, owner } from "./demo-store";
import { MEMORY_NS, REGISTRY } from "./config";

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

export function closeVault(): void {
  session?.close();
  session = undefined;
  emit();
}

export async function saveMemory(text: string) {
  const s = session ?? (await openVault());
  const at = Date.now();
  const sealed = await s.seal(ns(MEMORY_NS), { text, at });
  const bytes = sealed.toBytes();
  const stored = { id: `${at}-${toHex(bytes.slice(-4)).slice(2)}`, at, hex: toHex(bytes) };
  memories.add(stored);
  return { stored, epoch: sealed.epoch, size: bytes.length };
}

export const describeSealed = (hex: `0x${string}`) => {
  const bytes = toBytes(hex);
  const head = parseSealed(bytes);
  return { epoch: head.epoch, size: bytes.length, bytes };
};
