"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ns, parseSealed } from "satchel-sdk";
import { toBytes } from "viem";
import { KeyRail } from "@/components/KeyRail";
import { ask, ChatError, type Turn } from "@/lib/assistant";
import { epochOf, short } from "@/lib/chain";
import { MEMORY_NS, PIP_SUGGESTIONS } from "@/lib/config";
import { credential, grants, memories, owner, type StoredCredential, type StoredGrant, type StoredMemory } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { usePromptCount } from "@/lib/prompts";
import { addSecondPasskey, createVault, describeSealed, openVault, openVaultWithSecondPasskey, saveMemory, useSession } from "@/lib/vault";
import { AppBar } from "./AppBar";
import { Chat, type ChatTurn, type SealedNote } from "./Chat";
import { OwnerFunding } from "./OwnerFunding";

export const PIP_LINKS = [
  { href: "/pip/", label: "Chat" },
  { href: "/pip/share/", label: "Sharing" },
];

type Busy = "create" | "open" | "second" | undefined;

const turnId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function PipApp() {
  const session = useSession();
  const prompts = usePromptCount();
  const [cred, setCred] = useState<StoredCredential | undefined>();
  const [ownerAddr, setOwnerAddr] = useState<`0x${string}` | undefined>();
  const [mems, setMems] = useState<StoredMemory[]>([]);
  const [gs, setGs] = useState<StoredGrant[]>([]);
  const [busy, setBusy] = useState<Busy>();
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<Failure | undefined>();
  const [chatError, setChatError] = useState<{ message: string; code: string } | undefined>();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [fp, setFp] = useState<string | undefined>();
  const [plain, setPlain] = useState<Record<string, string>>({});
  const [epoch, setEpoch] = useState(1);
  const [chainErr, setChainErr] = useState<string | undefined>();
  const [secondAdded, setSecondAdded] = useState(false);
  const plainRef = useRef(plain);
  plainRef.current = plain;

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
        } catch {
          // a row this vault cannot open stays sealed and is left out of the model's context
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
    const nsHash = mems[0] ? parseSealed(toBytes(mems[0].hex)).nsHash : gs[0]?.grant.nsHash;
    if (!addr || !nsHash) return;
    let live = true;
    epochOf(addr, nsHash)
      .then((e) => live && (setEpoch(e), setChainErr(undefined)))
      .catch((e: unknown) => live && setChainErr(e instanceof Error ? (e.message.split("\n")[0] ?? "") : String(e)));
    return () => {
      live = false;
    };
  }, [session, ownerAddr, mems, gs]);

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

  const send = async (text: string) => {
    const user: ChatTurn = { id: turnId(), role: "user", content: text };
    const history: Turn[] = [...turns, user].filter((t): t is ChatTurn & { role: "user" | "assistant" } => t.role !== "system").map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, user]);
    setThinking(true);
    setChatError(undefined);
    try {
      // the model sees what this browser just unsealed, and nothing else
      const { reply, remembered } = await ask("pip", history, Object.values(plainRef.current));
      const sealed: SealedNote[] = [];
      for (const fact of remembered) {
        const r = await saveMemory(fact);
        sealed.push({ text: fact, epoch: r.epoch, size: r.size });
      }
      setTurns((t) => [...t, { id: turnId(), role: "assistant", content: reply || "Done.", ...(sealed.length ? { sealed } : {}) }]);
    } catch (e) {
      if (e instanceof ChatError) setChatError({ message: e.message, code: e.code });
      else setError(failure(e));
    } finally {
      setThinking(false);
      reload();
    }
  };

  const hasVault = cred !== undefined;
  const appsOnRail = gs.map((g) => ({ name: g.app, revoked: g.revoked !== undefined }));
  const live = gs.filter((g) => g.revoked === undefined);

  const gate = session ? undefined : hasVault ? (
    <div>
      <h3>Your vault is closed</h3>
      <p className="muted small">Opening it asks for your passkey once. Pip then reads and writes memory without another prompt.</p>
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void run("open", async () => void (await openVault()))}>
          {busy === "open" ? "Waiting for your passkey." : "Open my vault"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== undefined} onClick={() => void run("open", async () => void (await openVaultWithSecondPasskey()))}>
          Open with my second passkey
        </button>
      </div>
    </div>
  ) : (
    <div>
      <h3>Create your vault</h3>
      <p className="muted small">
        One passkey creates the key that locks Pip&apos;s memory. It is rebuilt from the passkey each visit and never saved, so there is nothing for anyone to recover for you.
      </p>
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void run("create", async () => void (await createVault()))}>
          {busy === "create" ? "Waiting for your passkey." : "Create my vault"}
        </button>
      </div>
    </div>
  );

  const known = Object.keys(plain).length;

  return (
    <>
      <AppBar app="Pip" links={PIP_LINKS} />
      <div className="demo">
        <div className="demo-col">
          <h1>Talk to Pip</h1>
          <p>
            Pip keeps what you tell it that lasts. Each fact is sealed on this device under <code>{MEMORY_NS}</code> before it is stored, and Pip reads it back to answer you.
          </p>

          <Chat
            who="Pip"
            testid="pip-chat"
            turns={turns}
            busy={thinking}
            gate={gate}
            placeholder="Tell Pip something about you, or ask for help"
            suggestions={PIP_SUGGESTIONS}
            onSend={(t) => void send(t)}
          />

          {chatError && (
            <div className="callout callout-error" role="alert" data-testid="chat-error">
              <p>
                <strong>Pip could not answer.</strong> Your memory is untouched.
              </p>
              <p className="mono">
                {chatError.code}: {chatError.message}
              </p>
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
        </div>

        <div className="demo-col">
          <div className="panel-head">
            <h3 style={{ fontSize: 18, marginTop: 0 }}>What Pip remembers</h3>
            <span className="small muted" data-testid="memory-count">
              {mems.length} sealed
            </span>
          </div>
          {mems.length === 0 ? (
            <div className="ghost-row">
              <p style={{ margin: 0 }}>Nothing yet. Tell Pip something that lasts, like what you eat or the airport you fly from, and it appears here sealed.</p>
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
                      e{d.epoch} {d.size} B{fp ? ` fp ${fp}` : ""}
                    </span>
                    <span className="memory-cipher" title={m.hex}>
                      {short(m.hex)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {session && known > 0 && <p className="small muted">Pip sends these {known} to the model with each message, from this page only.</p>}

          <p className="small" data-testid="grant-summary">
            {live.length === 0 ? (
              gs.length === 0 ? (
                <>
                  No app can read this. <Link href="/fern/">Open Fern</Link>, tap Connect, and Pip asks you to allow it.
                </>
              ) : (
                <>
                  Every app has been revoked. <Link href="/pip/share/">Sharing</Link> lists them.
                </>
              )
            ) : (
              <>
                {live.map((g) => g.app).join(", ")} can read this. <Link href="/pip/share/">Revoke on Sharing</Link>.
              </>
            )}
          </p>

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

          {(session || ownerAddr) && <OwnerFunding owner={session?.registryOwner ?? ownerAddr} />}

          {hasVault && (
            <details className="card" data-testid="second-passkey">
              <summary className="small" style={{ cursor: "pointer", fontWeight: 500 }}>Second passkey</summary>
              <p className="muted small">
                If you lose this passkey and have no other, your memory cannot be opened by anyone. A second passkey, added with <code>addPasskey()</code> while this one is open, opens the same vault on this device.
              </p>
              {session && (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy !== undefined}
                    onClick={() =>
                      void run("second", async () => {
                        await addSecondPasskey();
                        setSecondAdded(true);
                      })
                    }
                  >
                    {busy === "second" ? "Waiting for your passkey." : "Add a second passkey"}
                  </button>
                </div>
              )}
              {secondAdded && (
                <p className="status-line" data-testid="second-status">
                  <span className="badge-ok">added</span>
                  <span>Either passkey now opens this vault on this device.</span>
                </p>
              )}
            </details>
          )}
        </div>
      </div>
    </>
  );
}
