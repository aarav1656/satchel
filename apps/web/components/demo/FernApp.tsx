"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { keccak256, type Hex } from "viem";
import { KeyRail } from "@/components/KeyRail";
import { epochOf, grantOf, short } from "@/lib/chain";
import { MEMORY_NS } from "@/lib/config";
import { grants, memories, type StoredGrant } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { fernIdentity, readMemories, type Fern, type Row } from "@/lib/fern";
import { AppBar } from "./AppBar";

const LINKS = [{ href: "/fern/", label: "Reader" }];

interface Chain {
  active: boolean;
  epoch: number;
}

export function FernApp() {
  const router = useRouter();
  const [fern, setFern] = useState<Fern | undefined>();
  const [mine, setMine] = useState<StoredGrant[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [chain, setChain] = useState<Chain | undefined>();
  const [error, setError] = useState<Failure | undefined>();
  const [reading, setReading] = useState(false);

  useEffect(() => {
    fernIdentity().then(setFern, (e: unknown) => setError(failure(e)));
  }, []);

  const refresh = useCallback(async () => {
    if (!fern) return;
    setReading(true);
    setError(undefined);
    try {
      const keyHash = keccak256(fern.publicKey);
      const mineNow = grants.list().filter((g) => g.grant.granteeKeyHash === keyHash);
      setMine(mineNow);
      setRows(await readMemories(fern, mineNow, memories.list()));
      const latest = [...mineNow].sort((a, b) => Number(b.grant.id) - Number(a.grant.id))[0];
      if (latest) {
        const [g, e] = await Promise.all([grantOf(latest.grant.id), epochOf(latest.owner, latest.grant.nsHash)]);
        setChain({ active: g.active, epoch: e });
      } else {
        setChain(undefined);
      }
    } catch (e) {
      setError(failure(e));
    } finally {
      setReading(false);
    }
  }, [fern]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const latest = [...mine].sort((a, b) => Number(b.grant.id) - Number(a.grant.id))[0];
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
                Fern will be allowed to read <code>{MEMORY_NS}</code>, read only. You approve it in Pip with one passkey prompt.
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
                  grant {latest.grant.id} covers {latest.grant.ns} at epoch {latest.grant.epoch}. The registry is at epoch {chain.epoch}.
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
                {error.code}: {error.message}
              </p>
            </div>
          )}

          {fern && (
            <dl className="kv small">
              <dt>fern key</dt>
              <dd title={fern.publicKey}>{keccak256(fern.publicKey as Hex).slice(2, 10)}</dd>
              <dt>origin</dt>
              <dd>kept in Fern&apos;s own browser database, never exported</dd>
            </dl>
          )}
        </div>

        <div className="demo-col">
          <KeyRail
            label="Key rail for Fern"
            origin="fern key"
            {...(fern ? { credentialId: keccak256(fern.publicKey as Hex).slice(2) } : {})}
            namespaces={
              latest && chain
                ? [{ path: latest.grant.ns, epoch: chain.epoch, fingerprint: `grant ${latest.grant.id}`, apps: [{ name: "Fern", revoked: cut }] }]
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
          {latest && <p className="small muted">Reads use grant {latest.grant.id} ({short(latest.grant.txHash)}), checked against the registry on Monad.</p>}
        </div>
      </div>
    </>
  );
}
