"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ns } from "@satchel/sdk";
import { isHex, keccak256, type Hex } from "viem";
import { epochOf, grantOf, short, txUrl } from "@/lib/chain";
import { MEMORY_NS } from "@/lib/config";
import { grants, owner, type StoredGrant } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { openVault, useSession } from "@/lib/vault";
import { AppBar } from "./AppBar";
import { PIP_LINKS } from "./PipApp";
import { OwnerFunding } from "./OwnerFunding";

type Busy = { kind: "allow" } | { kind: "revoke"; id: string } | undefined;

export function ShareApp() {
  const params = useSearchParams();
  const connect = params.get("connect");
  const appName = params.get("app") ?? "Fern";
  const session = useSession();
  const [gs, setGs] = useState<StoredGrant[]>([]);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [nsEpoch, setNsEpoch] = useState<number | undefined>();
  const [busy, setBusy] = useState<Busy>();
  const [error, setError] = useState<Failure | undefined>();
  const [granted, setGranted] = useState<StoredGrant | undefined>();
  const [ownerAddr, setOwnerAddr] = useState<`0x${string}` | undefined>();

  const reload = useCallback(() => {
    setGs(grants.list());
    setOwnerAddr(owner.get());
  }, []);
  useEffect(reload, [reload]);

  useEffect(() => {
    let live = true;
    void (async () => {
      const next: Record<string, boolean> = {};
      for (const g of gs) next[g.grant.id] = (await grantOf(g.grant.id)).active;
      const first = gs[0];
      const now = first ? await epochOf(first.owner, first.grant.nsHash) : undefined;
      if (live) {
        setActive(next);
        setNsEpoch(now);
      }
    })();
    return () => {
      live = false;
    };
  }, [gs]);

  const validConnect = connect !== null && isHex(connect) && connect.length === 132;
  const alreadyAllowed = validConnect
    ? gs.find((g) => g.grant.granteeKeyHash === keccak256(connect as Hex) && g.revoked === undefined && active[g.grant.id] !== false && (nsEpoch === undefined || g.grant.epoch === nsEpoch))
    : undefined;

  const allow = async () => {
    if (!connect) return;
    setBusy({ kind: "allow" });
    setError(undefined);
    try {
      const s = await openVault();
      // An app key that held a grant before is being let back in after a revoke: that is regrant(), the same transaction as grant().
      const returning = gs.some((g) => g.grant.granteeKeyHash === keccak256(connect as Hex));
      const issue = returning ? s.regrant.bind(s) : s.grant.bind(s);
      const grant = await issue(ns(MEMORY_NS), connect as Hex, { label: appName });
      const stored: StoredGrant = { app: appName, owner: s.registryOwner, grant };
      grants.add(stored);
      setGranted(stored);
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(undefined);
      reload();
    }
  };

  const revoke = async (g: StoredGrant) => {
    setBusy({ kind: "revoke", id: g.grant.id });
    setError(undefined);
    try {
      const s = session ?? (await openVault());
      const r = await s.revoke(ns(MEMORY_NS), g.grant.id);
      grants.markRevoked(g.grant.id, { epoch: r.epoch, txHash: r.txHash, at: Date.now() });
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(undefined);
      reload();
    }
  };

  return (
    <>
      <AppBar app="Pip" links={PIP_LINKS} />
      <div className="demo">
        <div className="demo-col">
          <h1>Apps that can read your memory</h1>
          <p>A grant gives one app a key to one folder, read only. Revoking stops that app reading anything sealed from then on.</p>

          {connect !== null && !validConnect && (
            <div className="callout callout-error" role="alert">
              <p>This link does not carry an app key. Open Fern and tap Connect to make a fresh one.</p>
            </div>
          )}

          {alreadyAllowed && !granted && (
            <div className="callout">
              <p>{alreadyAllowed.app} already holds an active grant on {alreadyAllowed.grant.ns}. <Link href={`/fern/?grant=${alreadyAllowed.grant.txHash}`}>Return to {alreadyAllowed.app}</Link>.</p>
            </div>
          )}

          {validConnect && !granted && !alreadyAllowed && (
            <div className="card" data-testid="allow-card">
              <h3>Allow {appName} to read {MEMORY_NS}?</h3>
              <p className="muted small">
                {appName} gets a key to this folder only. It cannot read your other folders and cannot write to this one.
              </p>
              <dl className="kv" style={{ marginTop: "var(--s-3)" }}>
                <dt>app key</dt>
                <dd title={connect}>{short(connect)}</dd>
              </dl>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy !== undefined} onClick={() => void allow()}>
                  {busy?.kind === "allow" ? (session ? "Recording on Monad." : "Waiting for your passkey.") : "Allow"}
                </button>
                <Link href="/fern/" className="btn btn-secondary">
                  Back to {appName}
                </Link>
              </div>
            </div>
          )}

          {granted && (
            <div className="card" data-testid="granted">
              <p className="status-line">
                <span className="badge-ok">confirmed</span>
                <span>
                  {granted.app} can read {MEMORY_NS}, epoch {granted.grant.epoch}. Grant {granted.grant.id}.
                </span>
                <a href={txUrl(granted.grant.txHash)} target="_blank" rel="noreferrer" data-testid="grant-tx" data-hash={granted.grant.txHash}>
                  {short(granted.grant.txHash)}
                </a>
              </p>
              <p className="small muted" data-testid="grant-handoff">
                {granted.app} needs only this transaction hash: it rebuilds the grant from the receipt on Monad, with its own key.
              </p>
              <div className="btn-row">
                <Link href={`/fern/?grant=${granted.grant.txHash}`} className="btn">
                  Return to {granted.app}
                </Link>
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

          <h3 style={{ fontSize: 18 }}>Grants</h3>
          {gs.length === 0 ? (
            <div className="ghost-row">
              <p style={{ margin: 0 }}>
                No app can read your memory. <Link href="/fern/">Open Fern</Link>, tap Connect, and it shows up here.
              </p>
            </div>
          ) : (
            gs.map((g) => {
              const live = g.revoked === undefined && active[g.grant.id] !== false;
              const behind = live && nsEpoch !== undefined && g.grant.epoch < nsEpoch;
              return (
                <div className="card" key={g.grant.id} data-testid="grant-row" data-grant-id={g.grant.id} data-active={live ? "true" : "false"}>
                  <p className="status-line" style={{ marginTop: 0 }}>
                    <strong style={{ color: "var(--ink)" }}>{g.app}</strong>
                    <span className="badge">{g.grant.ns}</span>
                    <span className="badge">epoch {g.grant.epoch}</span>
                    <span className={live ? "badge-ok" : "badge-err"}>{live ? "active" : "revoked"}</span>
                    {behind && <span className="badge">behind: folder is at epoch {nsEpoch}</span>}
                  </p>
                  <p className="small muted">
                    {behind
                      ? `${g.app}'s grant is still active and opens epoch ${g.grant.epoch} only. The folder moved to epoch ${nsEpoch} when another grant was revoked, so ${g.app} asks again to read anything sealed since.`
                      : live
                      ? `${g.app} can read ${g.grant.ns}, epoch ${g.grant.epoch}. Revoking stops ${g.app} reading anything sealed from now on. ${g.app} keeps what it already read; no system can take that back.`
                      : `${g.app} is revoked. New memories are sealed at epoch ${g.revoked ? g.revoked.epoch : g.grant.epoch + 1} and ${g.app} cannot open them.`}
                  </p>
                  <p className="status-line">
                    <span>grant tx</span>
                    <a href={txUrl(g.grant.txHash)} target="_blank" rel="noreferrer" data-hash={g.grant.txHash}>
                      {short(g.grant.txHash)}
                    </a>
                    {g.revoked && (
                      <>
                        <span>revoke tx</span>
                        <a href={txUrl(g.revoked.txHash)} target="_blank" rel="noreferrer" data-testid="revoke-tx" data-hash={g.revoked.txHash}>
                          {short(g.revoked.txHash)}
                        </a>
                      </>
                    )}
                  </p>
                  {live && (
                    <div className="btn-row">
                      <button type="button" className="btn btn-danger" disabled={busy !== undefined} onClick={() => void revoke(g)}>
                        {busy?.kind === "revoke" && busy.id === g.grant.id ? (session ? "Recording on Monad." : "Waiting for your passkey.") : `Revoke ${g.app}`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="demo-col">
          <OwnerFunding owner={session?.registryOwner ?? ownerAddr} />
          {!session && !ownerAddr && (
            <div className="card">
              <h3>No vault in this browser</h3>
              <p className="muted small">Grants come from the vault that holds the passkey. Create it first, then connect an app.</p>
              <div className="btn-row">
                <Link href="/pip/" className="btn">
                  Create my vault
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
