"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchedGrant } from "satchel-sdk";
import { keccak256, type Hex } from "viem";
import { KeyRail } from "@/components/KeyRail";
import { ask, ChatError, type Turn } from "@/lib/assistant";
import { epochOf, grantOf, short } from "@/lib/chain";
import { FERN_SUGGESTIONS, MEMORY_NS, NOTE_BUS_URL, SEALER_ORIGIN } from "@/lib/config";
import { memories, STORAGE } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { acceptGrant, fernIdentity, isTxHash, loadGrants, loadSealedNotes, readMemories, type Fern, type Row } from "@/lib/fern";
import { AppBar } from "./AppBar";
import { Chat, type ChatTurn } from "./Chat";

const LINKS = [{ href: "/fern/", label: "Chat" }];

const turnId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

interface Chain {
  active: boolean;
  epoch: number;
}

export function FernApp() {
  const router = useRouter();
  const params = useSearchParams();
  const incoming = params.get("grant");
  const [fern, setFern] = useState<Fern | undefined>();
  const [mine, setMine] = useState<FetchedGrant[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<Chain | undefined>();
  const [error, setError] = useState<Failure | undefined>();
  const [reading, setReading] = useState(false);
  const [pasted, setPasted] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [chatError, setChatError] = useState<{ message: string; code: string } | undefined>();
  const taken = useRef<string | null>(null);

  useEffect(() => {
    fernIdentity().then(setFern, (e: unknown) => setError(failure(e)));
  }, []);

  /**
   * One read of everything Fern is allowed. Each remembered grant is checked against the registry first; a revoked one is dropped,
   * so every sealed memory it covered comes back locked as GRANT_REVOKED and no plaintext from an earlier read is kept.
   */
  const readNow = useCallback(async (): Promise<Row[]> => {
    if (!fern) return [];
    const grants = await loadGrants();
    setMine(grants);
    const onChain = await Promise.all(grants.map((g) => grantOf(g.id)));
    const status = onChain.map((c) => c.active);
    const latestGrant = grants[grants.length - 1];
    const latestChain = onChain[onChain.length - 1];
    if (latestGrant && latestChain) setChain({ active: latestChain.active, epoch: await epochOf(latestChain.owner, latestGrant.nsHash) });
    else setChain(undefined);
    const next = await readMemories(fern, grants.filter((_, i) => status[i]), await loadSealedNotes());
    setRows(next);
    return next;
  }, [fern]);

  const refresh = useCallback(async () => {
    if (!fern) return;
    setReading(true);
    try {
      await readNow();
    } catch (e) {
      setError(failure(e));
    } finally {
      setReading(false);
    }
  }, [fern, readNow]);

  const send = async (text: string) => {
    const user: ChatTurn = { id: turnId(), role: "user", content: text };
    const history: Turn[] = [...turns, user].filter((t): t is ChatTurn & { role: "user" | "assistant" } => t.role !== "system").map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, user]);
    setThinking(true);
    setChatError(undefined);
    try {
      const now = await readNow();
      const open = now.flatMap((r) => (r.state === "open" ? [r.text] : []));
      const lockedRow = now.find((r) => r.state === "locked");
      const { reply } = await ask("fern", history, open);
      const read = { open: open.length, locked: now.length - open.length, ...(lockedRow && lockedRow.state === "locked" ? { code: lockedRow.code } : {}) };
      setTurns((t) => [...t, { id: turnId(), role: "assistant", content: reply || "Done.", read }]);
    } catch (e) {
      if (e instanceof ChatError) setChatError({ message: e.message, code: e.code });
      else setError(failure(e));
    } finally {
      setThinking(false);
    }
  };

  const take = useCallback(
    async (tx: Hex) => {
      if (!fern) return;
      setError(undefined);
      try {
        await acceptGrant(fern, tx);
      } catch (e) {
        setError(failure(e));
        return;
      }
      await refresh();
    },
    [fern, refresh],
  );

  useEffect(() => {
    if (!fern) return;
    if (isTxHash(incoming) && taken.current !== incoming) {
      taken.current = incoming;
      void take(incoming).then(() => router.replace("/fern/"));
    } else {
      void refresh();
    }
  }, [fern, incoming, take, refresh, router]);

  const latest = mine[mine.length - 1];
  const cut = latest !== undefined && chain !== undefined && !chain.active;
  const sealerBase = SEALER_ORIGIN || "";
  const connectHref = fern
    ? `${sealerBase}/pip/share/?connect=${fern.publicKey}&app=Fern`
    : `${sealerBase}/pip/share/`;

  const openRows = rows.filter((r) => r.state === "open").length;

  const gate = mine.length === 0 ? (
    <div data-testid="fern-empty">
      <h3>Fern cannot see your memory yet.</h3>
      <p className="muted small">
        Fern will be allowed to read <code>{MEMORY_NS}</code>, read only. You approve it in Pip with one passkey prompt, and Pip sends Fern back with the grant&apos;s transaction hash.
      </p>
      <div className="btn-row">
        <button type="button" className="btn" disabled={!fern} onClick={() => router.push(connectHref)}>
          Connect to your memory
        </button>
      </div>
    </div>
  ) : undefined;

  return (
    <>
      <AppBar app="Fern" links={LINKS} />
      <div className="demo">
        <div className="demo-col">
          <h1>Talk to Fern</h1>
          <p>
            Fern plans weekends and trips. It is a second app with its own key and never your passkey: it opens your memory only through a grant Pip issued on Monad, and checks that grant before every answer.
          </p>

          <Chat
            who="Fern"
            testid="fern-chat"
            turns={turns}
            busy={thinking}
            gate={gate}
            placeholder="Ask Fern to plan something"
            suggestions={FERN_SUGGESTIONS}
            onSend={(t) => void send(t)}
          />

          {chatError && (
            <div className="callout callout-error" role="alert" data-testid="chat-error">
              <p>
                <strong>Fern could not answer.</strong> Your memory is untouched.
              </p>
              <p className="mono">
                {chatError.code}: {chatError.message}
              </p>
            </div>
          )}

          {latest && chain && (
            <div className="card" data-testid="fern-status" data-active={chain.active ? "true" : "false"}>
              <p className="status-line" style={{ marginTop: 0 }}>
                <span className={chain.active ? "badge-ok" : "badge-err"}>{chain.active ? "grant active" : "grant revoked"}</span>
                <span>
                  grant {latest.id} covers {latest.ns ?? MEMORY_NS} at epoch {latest.epoch}. The registry is at epoch {chain.epoch}.
                </span>
              </p>
              {cut && (
                <p className="small muted">
                  Pip revoked Fern and sealed its memories again at epoch {chain.epoch}. Fern&apos;s grant opens nothing in the store now, so it answers without them. Anything it read before the revoke may still be in its own cache; no system can take that back.
                </p>
              )}
              <div className="btn-row">
                <button type="button" className="btn btn-secondary" disabled={reading} onClick={() => void refresh()}>
                  {reading ? "Reading" : "Read memory again"}
                </button>
                {cut && (
                  <button type="button" className="btn" onClick={() => router.push(connectHref)}>
                    Ask Pip for a new grant
                  </button>
                )}
              </div>
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

          <details className="card">
            <summary className="small" style={{ cursor: "pointer", fontWeight: 500 }}>Use a grant by transaction hash</summary>
            <label className="field-label" htmlFor="grant-tx" style={{ marginTop: "var(--s-3)" }}>
              Grant transaction
            </label>
            <input id="grant-tx" className="input mono" placeholder="0x, 64 hex characters" value={pasted} onChange={(e) => setPasted(e.target.value.trim())} />
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!fern || !isTxHash(pasted)}
                onClick={() => {
                  if (isTxHash(pasted)) void take(pasted).then(() => setPasted(""));
                }}
              >
                Read with this grant
              </button>
            </div>
            <p className="small muted" style={{ marginTop: "var(--s-3)" }}>
              Fern rebuilds the grant from that transaction&apos;s receipt on Monad, so the hash can reach Fern by a link, a QR code or a message. A hash issued to another app&apos;s key is refused.
            </p>
          </details>
        </div>

        <div className="demo-col">
          <div className="panel-head">
            <h3 style={{ fontSize: 18, marginTop: 0 }}>What Fern can read</h3>
            <span className="small muted" data-testid="fern-count">
              {openRows} of {rows.length} open
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="ghost-row">
              <p style={{ margin: 0 }}>
                {mine.length === 0
                  ? <>Nothing to read until Pip allows Fern. Tell <Link href="/pip/">Pip</Link> something first, then connect.</>
                  : <>Pip has sealed nothing under {MEMORY_NS} yet. Tell <Link href="/pip/">Pip</Link> something and read again.</>}
              </p>
            </div>
          ) : (
            <ul className="memory-list" data-testid="fern-memories">
              {rows.map((r) => (
                <li key={r.id} data-testid="fern-row" data-state={r.state} data-epoch={r.epoch} className={r.state === "locked" ? "memory-locked" : undefined}>
                  <span className="memory-text">{r.state === "open" ? r.text : `locked: ${r.code}`}</span>
                  <span className="memory-meta">
                    e{r.epoch} {r.size} B
                  </span>
                  {r.state === "locked" && (
                    <span className="small muted" style={{ gridColumn: "1 / -1" }} data-testid="fern-locked-reason">
                      {r.message}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {latest && <p className="small muted">Reads use grant {latest.id} ({short(latest.txHash)}), rebuilt from its transaction and checked against the registry on Monad before each answer.</p>}

          <KeyRail
            label="Key rail for Fern"
            origin="fern key"
            {...(fern ? { credentialId: keccak256(fern.publicKey as Hex).slice(2) } : {})}
            namespaces={
              latest && chain
                ? [{ path: latest.ns ?? MEMORY_NS, epoch: chain.epoch, fingerprint: `grant ${latest.id}`, apps: [{ name: "Fern", revoked: cut }] }]
                : []
            }
          />
          {mine.length === 0 && <p className="rail-empty">The branch draws when Pip allows Fern.</p>}

          <dl className="kv small" data-testid="fern-storage">
            <dt>key</dt>
            <dd>{STORAGE.fernIdentity}</dd>
            <dt>grants</dt>
            <dd>{STORAGE.fernGrants}</dd>
            <dt>memories</dt>
            <dd>
              {NOTE_BUS_URL ? `HTTPS note bus at ${NOTE_BUS_URL} (ciphertext only)` : `${STORAGE.memories}, same origin as Pip`}.{" "}
              <Link href="/guides/two-apps/">Two apps</Link> covers the split-origin flow.
            </dd>
          </dl>
        </div>
      </div>
    </>
  );
}
