"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FetchedGrant } from "@satchel/sdk";
import { keccak256, type Hex } from "viem";
import { KeyRail } from "@/components/KeyRail";
import { epochOf, grantOf, short } from "@/lib/chain";
import { MEMORY_NS } from "@/lib/config";
import { memories, STORAGE } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { acceptGrant, fernIdentity, isTxHash, loadGrants, readMemories, type Fern, type Row } from "@/lib/fern";
import { AppBar } from "./AppBar";

const LINKS = [{ href: "/fern/", label: "Reader" }];

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
  const taken = useRef<string | null>(null);

  useEffect(() => {
    fernIdentity().then(setFern, (e: unknown) => setError(failure(e)));
  }, []);

  const refresh = useCallback(async () => {
    if (!fern) return;
    setReading(true);
    try {
      const grants = await loadGrants();
      setMine(grants);
      setRows(await readMemories(fern, grants, memories.list()));
      const latest = grants[grants.length - 1];
      if (latest) {
        const g = await grantOf(latest.id);
        setChain({ active: g.active, epoch: await epochOf(g.owner, latest.nsHash) });
      } else {
        setChain(undefined);
      }
    } catch (e) {
      setError(failure(e));
    } finally {
      setReading(false);
    }
  }, [fern]);

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
  const connectHref = fern ? `/pip/share/?connect=${fern.publicKey}&app=Fern` : "/pip/share/";

  return (
    <>
      <AppBar app="Fern" links={LINKS} />
      <div className="demo">
        <div className="demo-col">
          <h1>What Fern can see</h1>
          <p>Fern is a second app. It holds its own key, never your passkey, and reads your memory only through a grant you issued.</p>

          {mine.length === 0 && (
            <div className="card" data-testid="fern-empty">
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
          )}

          {latest && chain && (
            <div className="card" data-testid="fern-status" data-active={chain.active ? "true" : "false"}>
              <p className="status-line" style={{ marginTop: 0 }}>
                <span className={chain.active ? "badge-ok" : "badge-err"}>{chain.active ? "grant active" : "grant revoked"}</span>
                <span>
                  grant {latest.id} covers {latest.ns ?? MEMORY_NS} at epoch {latest.epoch}. The registry is at epoch {chain.epoch}.
                </span>
              </p>
              {cut && <p className="small muted">Fern was revoked. It can still read what it saw before, and nothing sealed since.</p>}
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

          <div className="card">
            <label className="field-label" htmlFor="grant-tx">
              Use a grant by transaction hash
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
          </div>

          <dl className="kv small" data-testid="fern-storage">
            <dt>key</dt>
            <dd>{STORAGE.fernIdentity}</dd>
            <dt>grants</dt>
            <dd>{STORAGE.fernGrants}</dd>
            <dt>memories</dt>
            <dd>{STORAGE.memories}, the one store Pip and Fern share because they are one origin. <Link href="/guides/two-apps/">Two apps</Link> covers two origins.</dd>
          </dl>
        </div>

        <div className="demo-col">
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

          <h3 style={{ fontSize: 18, marginTop: "var(--s-6)" }}>Memories Fern reads</h3>
          {rows.length === 0 ? (
            <div className="ghost-row">
              <p style={{ margin: 0 }}>
                {mine.length === 0
                  ? <>Nothing to read until Pip allows Fern. Save a memory in <Link href="/pip/">Pip</Link> first, then connect.</>
                  : <>Pip has sealed nothing under {MEMORY_NS} yet. Save one in <Link href="/pip/">Pip</Link> and read again.</>}
              </p>
            </div>
          ) : (
            <ul className="memory-list" data-testid="fern-memories">
              {rows.map((r) => (
                <li key={r.id} data-testid="fern-row" data-state={r.state} data-epoch={r.epoch} className={r.state === "locked" ? "memory-locked" : undefined}>
                  <span className="memory-text">{r.state === "open" ? r.text : `locked: ${r.code}`}</span>
                  <span className="memory-meta">
                    {MEMORY_NS} e{r.epoch} {r.size} B
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
          {latest && <p className="small muted">Reads use grant {latest.id} ({short(latest.txHash)}), rebuilt from its transaction and checked against the registry on Monad.</p>}
        </div>
      </div>
    </>
  );
}
