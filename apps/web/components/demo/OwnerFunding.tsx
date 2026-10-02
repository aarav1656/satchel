"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { addressUrl, balanceOf, short } from "@/lib/chain";
import { MIN_OWNER_BALANCE_WEI } from "@/lib/config";

/** The vault's registry address pays for grant and revoke. Shows its live balance and what to do when it is short. */
export function OwnerFunding({ owner, onBalance }: { owner: Address | undefined; onBalance?: (enough: boolean) => void }) {
  const [bal, setBal] = useState<{ wei: bigint; mon: string } | undefined>();
  const [err, setErr] = useState<string | undefined>();
  const check = useCallback(async () => {
    if (!owner) return;
    setErr(undefined);
    try {
      const b = await balanceOf(owner);
      setBal(b);
      onBalance?.(b.wei >= MIN_OWNER_BALANCE_WEI);
    } catch (e) {
      setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
    }
  }, [owner, onBalance]);
  useEffect(() => {
    void check();
  }, [check]);
  if (!owner) return null;
  const enough = bal !== undefined && bal.wei >= MIN_OWNER_BALANCE_WEI;
  return (
    <div className="card">
      <h3>Registry address</h3>
      <p className="muted small">
        Granting and revoking are Monad transactions. They are sent from an address derived from your passkey, so it needs a little testnet MON.
      </p>
      <dl className="kv" style={{ marginTop: "var(--s-3)" }}>
        <dt>address</dt>
        <dd>
          <a href={addressUrl(owner)} target="_blank" rel="noreferrer" data-testid="owner-address" title={owner}>
            {owner}
          </a>
        </dd>
        <dt>balance</dt>
        <dd data-testid="owner-balance">{bal ? `${bal.mon} MON` : err ? "unreadable" : "reading from Monad"}</dd>
      </dl>
      {err && <p className="small" style={{ color: "var(--error)" }}>Monad RPC did not answer: {err}</p>}
      {bal && !enough && (
        <div className="callout callout-warn">
          <p>
            Not enough to send a grant. Send testnet MON to <span className="mono">{short(owner)}</span> from the{" "}
            <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
              Monad faucet
            </a>
            , then check again. Sealing and reading need no MON.
          </p>
        </div>
      )}
      <div className="btn-row">
        <button type="button" className="btn btn-secondary" onClick={() => void check()}>
          Check balance
        </button>
      </div>
    </div>
  );
}
