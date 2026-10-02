"use client";

import { useSyncExternalStore } from "react";

/** Counts WebAuthn ceremonies (one per browser passkey sheet) by wrapping navigator.credentials once, without touching the SDK. */
const counts = { create: 0, get: 0 };
let snapshot = 0;
const listeners = new Set<() => void>();
let installed = false;

function install() {
  if (installed || typeof navigator === "undefined" || !navigator.credentials) return;
  installed = true;
  const creds = navigator.credentials;
  const create = creds.create.bind(creds);
  const get = creds.get.bind(creds);
  const bump = (k: "create" | "get") => {
    counts[k]++;
    snapshot = counts.create + counts.get;
    listeners.forEach((l) => l());
  };
  creds.create = (o) => (bump("create"), create(o));
  creds.get = (o) => (bump("get"), get(o));
}
install();

export const promptCount = () => snapshot;
export const usePromptCount = () =>
  useSyncExternalStore(
    (l) => {
      install();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => 0,
  );
