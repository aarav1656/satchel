"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ns, parseSealed } from "satchel-sdk";
import { toBytes } from "viem";
import { KeyRail } from "@/components/KeyRail";
import { epochOf } from "@/lib/chain";
import { MEMORY_NS, SUGGESTED_MEMORY } from "@/lib/config";
import { credential, grants, memories, owner, type StoredCredential, type StoredGrant, type StoredMemory } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { usePromptCount } from "@/lib/prompts";
import { createVault, describeSealed, openVault, saveMemory, useSession } from "@/lib/vault";
import { AppBar } from "./AppBar";
import { OwnerFunding } from "./OwnerFunding";

export const PIP_LINKS = [
  { href: "/pip/", label: "Vault" },
  { href: "/pip/share/", label: "Sharing" },
];

type Busy = "create" | "open" | "save" | undefined;

export function PipApp() {
  const session = useSession();
  const prompts = usePromptCount();
  const [cred, setCred] = useState<StoredCredential | undefined>();
  const [ownerAddr, setOwnerAddr] = useState<`0x${string}` | undefined>();
  const [mems, setMems] = useState<StoredMemory[]>([]);
  const [gs, setGs] = useState<StoredGrant[]>([]);
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<Failure | undefined>();
  const [draft, setDraft] = useState(SUGGESTED_MEMORY);
  const [fp, setFp] = useState<string | undefined>();
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [epoch, setEpoch] = useState(1);
  const [last, setLast] = useState<{ epoch: number; size: number } | undefined>();
  const [chainErr, setChainErr] = useState<string | undefined>();

  const reload = useCallback(() => {
    setCred(credential.get());
    setOwnerAddr(owner.get());
    setMems(memories.list());
    setGs(grants.list());
  }, []);
  useEffect(reload, [reload]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    void (async () => {
      const f = await session.fingerprint(ns(MEMORY_NS));
      const out: Record<string, string> = {};
      for (const m of memories.list()) {
        try {
          out[m.id] = (await session.unsealJson<{ text: string }>(ns(MEMORY_NS), toBytes(m.hex))).text;
        } catch (e) {
          out[m.id] = `locked: ${failure(e).code}`;
        }
      }
      if (live) {
        setFp(f);
        setPlain(out);
      }
    })();
    return () => {
      live = false;
    };
  }, [session, mems]);

  useEffect(() => {
    const addr = session?.registryOwner ?? ownerAddr;
    const nsHash = mems[0] ? describeNs(mems[0]) : gs[0]?.grant.nsHash;
    if (!addr || !nsHash) return;
    let live = true;
    epochOf(addr, nsHash)
      .then((e) => live && (setEpoch(e), setChainErr(undefined)))
      .catch((e: unknown) => live && setChainErr(e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e)));
    return () => {
      live = false;
    };
  }, [session, ownerAddr, mems, gs, last]);

  const run = async (kind: NonNullable<Busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(undefined);
      reload();
    }
  };

  const hasVault = cred !== undefined;
  const appsOnRail = gs.map((g) => ({ name: g.app, revoked: g.revoked !== undefined }));

  return (
    <>
      <AppBar app="Pip" links={PIP_LINKS} />
      <div className="demo">
        <div className="demo-col">
          <h1>Your assistant&apos;s memory</h1>
          <p>Pip remembers what you tell it. Everything it remembers is sealed under <code>{MEMORY_NS}</code> with a key rebuilt from your passkey.</p>

          {!session && !hasVault && (
            <div className="card">
              <h3>Create your vault</h3>
              <p className="muted small">
                Your passkey creates the keys that lock your memory. They are rebuilt from the passkey each time and never saved. Satchel keeps no copy and cannot recover your memory without it.
              </p>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void run("create", async () => void (await createVault()))}>
                  {busy === "create" ? "Waiting for your passkey." : "Create my vault"}
                </button>
              </div>
            </div>
          )}

          {!session && hasVault && (
            <div className="card">
              <h3>Your vault is closed</h3>
              <p className="muted small">Opening it asks for your passkey once. Pip then reads and writes memory without another prompt.</p>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void run("open", async () => void (await openVault()))}>
                  {busy === "open" ? "Waiting for your passkey." : "Open my vault"}
                </button>
              </div>
            </div>
          )}

          {session && (
            <div className="card">
              <label className="field-label" htmlFor="memory-draft">
                Tell Pip something to remember
              </label>
              <textarea id="memory-draft" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  disabled={busy !== undefined || draft.trim() === ""}
                  onClick={() =>
                    void run("save", async () => {
                      const r = await saveMemory(draft.trim());
                      setLast({ epoch: r.epoch, size: r.size });
                      if (process.env.NODE_ENV !== "production") console.info(`sealed ns=${MEMORY_NS} epoch=${r.epoch} ${r.size} B fp=${fp ?? ""}`);
                    })
                  }
                >
                  {busy === "save" ? "Sealing" : "Save to memory"}
                </button>
              </div>
              <p className="muted small" style={{ marginTop: "var(--s-3)" }}>Encrypted on this device before it is stored. Only ciphertext leaves the page.</p>
              {last && (
                <p className="status-line" data-testid="seal-status">
                  <span className="badge-ok">sealed</span>
                  <span>
                    ns={MEMORY_NS} epoch={last.epoch} {last.size} B
                  </span>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="callout callout-error" role="alert" data-testid="error">
              <p>
                <strong>{error.person}</strong>
              </p>
              <p className="mono">
                {error.code}: {error.message} {error.fix && `fix: ${error.fix}`}
              </p>
            </div>
          )}

          {hasVault && (
            <p className="small muted">
              Second passkey: if you lose this passkey and have no other, your memory cannot be opened by anyone. Add one from a device that has this vault with <code>addPasskey()</code>.
            </p>
          )}

          {(session || ownerAddr) && <OwnerFunding owner={session?.registryOwner ?? ownerAddr} />}
        </div>

        <div className="demo-col">
          <KeyRail
            label="Key rail for Pip"
            {...(cred ? { credentialId: cred.credentialId } : {})}
            namespaces={hasVault ? [{ path: MEMORY_NS, epoch, fingerprint: fp ?? "locked", apps: appsOnRail }] : []}
          />
          {chainErr && <p className="small" style={{ color: "var(--error)" }}>Monad RPC did not answer the epoch read: {chainErr}</p>}
          {hasVault && (
            <p className="small muted" data-testid="prompt-count">
              Passkey prompts since this page loaded: {prompts}
            </p>
          )}
          {!hasVault && <p className="rail-empty">The rail draws when the vault exists: one passkey, one line per folder.</p>}

          <h3 style={{ fontSize: 18, marginTop: "var(--s-6)" }}>Sealed memories</h3>
          {mems.length === 0 ? (
            <div className="ghost-row">
              <p style={{ margin: 0 }}>Nothing sealed yet. Save this one and it is encrypted before it leaves the page.</p>
              <p style={{ margin: "var(--s-2) 0 0" }}>
                <strong>{SUGGESTED_MEMORY}</strong>
              </p>
            </div>
          ) : (
            <ul className="memory-list" data-testid="memory-list">
              {mems.map((m) => {
                const d = describeSealed(m.hex);
                const text = plain[m.id];
                return (
                  <li key={m.id} data-testid="memory-row" data-epoch={d.epoch}>
                    <span className={text === undefined ? "memory-text memory-locked" : "memory-text"}>{text ?? "Sealed. Open your vault to read it."}</span>
                    <span className="memory-meta">
                      {MEMORY_NS} e{d.epoch} {d.size} B
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="small" style={{ marginTop: "var(--s-4)" }}>
            {gs.length === 0 ? (
              <>
                No app can read your memory. <Link href="/fern/">Open Fern</Link>, tap Connect, and it shows up on <Link href="/pip/share/">Sharing</Link>.
              </>
            ) : (
              <>
                {gs.length} app{gs.length === 1 ? "" : "s"} hold a grant. Manage them on <Link href="/pip/share/">Sharing</Link>.
              </>
            )}
          </p>
        </div>
      </div>
    </>
  );
}

const describeNs = (m: StoredMemory) => parseSealed(toBytes(m.hex)).nsHash;
