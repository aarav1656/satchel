"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ns, type Satchel } from "satchel-sdk";
import { KeyRail } from "@/components/KeyRail";
import { CopyButton } from "@/components/CopyButton";
import { MEMORY_NS, NOTES_NS } from "@/lib/config";
import { credential } from "@/lib/demo-store";
import { failure, type Failure } from "@/lib/errors-ui";
import { scanBrowser, type ScanRow } from "@/lib/scan";
import { createVault, openVault, useSession } from "@/lib/vault";

function Problem({ f }: { f: Failure }) {
  return (
    <div className="callout callout-error" role="alert" data-testid="error">
      <p>
        <strong>{f.person}</strong>
      </p>
      <p className="mono">
        {f.code}: {f.message}
      </p>
    </div>
  );
}

/** The one passkey prompt on this page. Every live result below reads the session it opens and fills in without another prompt. */
export function ProofVault() {
  const session = useSession();
  const [stored, setStored] = useState<boolean | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | undefined>();
  useEffect(() => setStored(credential.get() !== undefined), [session]);
  if (session) {
    return (
      <p className="status-line" data-testid="proof-vault-open">
        <span className="badge-ok">vault open</span>
        <span>One passkey prompt opened it. The results below filled in from this session.</span>
      </p>
    );
  }
  const go = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (stored) await openVault();
      else await createVault();
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h3>{stored ? "Open your vault" : "Create your vault"}</h3>
      <p className="muted small">
        {stored ? "One passkey prompt opens it, and every result below fills in." : "No vault in this browser yet. One passkey prompt creates the same vault Pip uses, and every result below fills in."}
      </p>
      <div className="btn-row">
        <button type="button" className="btn" disabled={busy || stored === undefined} onClick={() => void go()} data-testid="proof-vault">
          {busy ? "Waiting for your passkey." : stored ? "Open my vault" : "Create my vault"}
        </button>
      </div>
      {error && <Problem f={error} />}
    </div>
  );
}

/** Renders its children from the open session, or a quiet placeholder until the vault is open. */
function Live({ children }: { children: (s: Satchel) => ReactNode }) {
  const session = useSession();
  if (session) return <>{children(session)}</>;
  return (
    <div className="ghost-row" data-testid="proof-waiting">
      Fills in when your vault is open.
    </div>
  );
}

interface Derivation {
  path: string;
  info: string;
  epoch: number;
  fp: string;
}

function DerivationBody({ s }: { s: Satchel }) {
  const [rows, setRows] = useState<Derivation[] | undefined>();
  const [error, setError] = useState<Failure | undefined>();
  useEffect(() => {
    void show();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  async function show() {
    setError(undefined);
    try {
      const out: Derivation[] = [];
      for (const path of [MEMORY_NS, NOTES_NS]) {
        const n = ns(path);
        out.push({ path, info: `satchel/ns/${path}`, epoch: (await s.seal(n, "epoch probe")).epoch, fp: await s.fingerprint(n) });
      }
      setRows(out);
    } catch (e) {
      setError(failure(e));
    }
  }
  return (
    <div className="proof-live">
      {error && <Problem f={error} />}
      {rows && (
        <div className="terminal" data-testid="derivation">
          {rows.map((r) => (
            <div key={r.path} style={{ marginBottom: "var(--s-3)" }} data-ns={r.path}>
              <div>ns     {r.path}</div>
              <div>info   {r.info}</div>
              <div>epoch  {r.epoch}</div>
              <div>fp     {r.fp}</div>
            </div>
          ))}
          <div className="dim">Derivation separates namespaces. Encryption seals the data. The only transactions are registry grants and revokes, sent by an address derived from the passkey; no wallet is involved.</div>
        </div>
      )}
    </div>
  );
}
export const DerivationPanel = () => <Live>{(s) => <DerivationBody s={s} />}</Live>;

function WrongNamespaceBody({ s }: { s: Satchel }) {
  const [res, setRes] = useState<{ ok: string; fail: Failure; epoch: number; fp: string } | undefined>();
  const [error, setError] = useState<Failure | undefined>();
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);
  async function run() {
    setError(undefined);
    try {
      const a = ns(MEMORY_NS);
      const blob = await s.seal(a, "wrong namespace probe");
      const ok = new TextDecoder().decode(await s.unseal(a, blob));
      let caught: Failure | undefined;
      try {
        await s.unseal(ns(NOTES_NS), blob);
      } catch (e) {
        caught = failure(e);
      }
      if (!caught) throw new Error("the wrong namespace opened the blob: namespacing is broken");
      setRes({ ok, fail: caught, epoch: blob.epoch, fp: await s.fingerprint(a) });
    } catch (e) {
      setError(failure(e));
    }
  }
  return (
    <div className="proof-live">
      {error && <Problem f={error} />}
      {res && (
        <>
          <div className="terminal" data-testid="wrong-ns-result">
            <div>seal    {MEMORY_NS}  epoch={res.epoch}</div>
            <div>unseal  {MEMORY_NS}  ok: &quot;{res.ok}&quot;</div>
            <div className="err">unseal  {NOTES_NS}  {res.fail.code}</div>
            <div className="dim">{res.fail.message}</div>
          </div>
          <KeyRail
            label="Wrong namespace attempt"
            namespaces={[{ path: MEMORY_NS, epoch: res.epoch, fingerprint: res.fp, stub: { toLabel: NOTES_NS, code: res.fail.code } }]}
            {...(s.credential ? { credentialId: s.credential.credentialId } : {})}
          />
        </>
      )}
    </div>
  );
}
export const WrongNamespacePanel = () => <Live>{(s) => <WrongNamespaceBody s={s} />}</Live>;

const PLANT = "proof.plain-test-value";

function ScanBody() {
  const [rows, setRows] = useState<ScanRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    void scan();
  }, []);
  const scan = async () => {
    setError(undefined);
    try {
      setRows(await scanBrowser());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const count = (v: ScanRow["verdict"]) => rows?.filter((r) => r.verdict === v).length ?? 0;
  return (
    <div className="proof-live">
      <div className="btn-row" style={{ marginTop: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={() => void scan()} data-testid="scan">
          Scan again
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            localStorage.setItem(PLANT, "0x" + "ab".repeat(32));
            void scan();
          }}
          data-testid="plant"
        >
          Plant a test value that is not ciphertext
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            localStorage.removeItem(PLANT);
            void scan();
          }}
        >
          Remove it
        </button>
      </div>
      {error && <div className="callout callout-error" role="alert"><p>{error}</p></div>}
      {rows && rows.length === 0 && (
        <div className="callout">
          <p>
            Nothing is stored in this browser yet, so a clean scan would prove nothing. <Link href="/pip/">Create a vault in Pip</Link>, save a memory, then scan again.
          </p>
        </div>
      )}
      {rows && rows.length > 0 && (
        <>
          <p className="status-line" data-testid="scan-summary">
            <span className={count("flagged") === 0 ? "badge-ok" : "badge-err"}>{count("flagged") === 0 ? "clean" : `${count("flagged")} flagged`}</span>
            <span>
              {rows.length} values: {count("ciphertext")} ciphertext, {count("public")} public, {count("other")} not satchel&apos;s, {count("flagged")} flagged
            </span>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Where</th><th>Key</th><th>Bytes</th><th>Verdict</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.area}/${r.key}`} data-verdict={r.verdict} data-testid="scan-row">
                    <td>{r.area}</td>
                    <td className="mono">{r.key}</td>
                    <td className="mono">{r.bytes}</td>
                    <td>
                      <span className={r.verdict === "flagged" ? "badge-err" : "badge"}>{r.verdict}</span> <span className="muted small">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="small muted">
        Satchel stores ciphertext and a public credential id. It stores no key. Flagged means key-like data in the clear or an unrecognised satchel record; not satchel&apos;s means a value satchel did not write.
      </p>
    </div>
  );
}

export const ScanPanel = () => <Live>{() => <ScanBody />}</Live>;

function CrossDeviceBody({ s }: { s: Satchel }) {
  const [here, setHere] = useState<string | undefined>();
  const [first, setFirst] = useState<{ path: string; fp: string } | undefined>();
  const [link, setLink] = useState("");
  useEffect(() => {
    void s.fingerprint(ns(MEMORY_NS)).then(setHere);
    const m = /^#fp=([a-z0-9/-]+):([0-9a-f]{8})$/.exec(location.hash);
    if (m) setFirst({ path: m[1] as string, fp: m[2] as string });
  }, [s]);
  useEffect(() => {
    if (here) setLink(`${location.origin}/proof/#fp=${MEMORY_NS}:${here}`);
  }, [here]);
  const equal = first && here ? first.fp === here : undefined;
  return (
    <div className="proof-live">
      {here && (
        <>
          <p className="small muted">This device opened {MEMORY_NS} with fingerprint <code data-testid="local-fp">{here}</code>. Open this link on another device that holds the same passkey, open the vault there, and the two fingerprints appear side by side.</p>
          <div className="codeblock">
            <div className="codeblock-head">
              <span>device link</span>
              <CopyButton text={link} />
            </div>
            <pre><code data-testid="device-link">{link}</code></pre>
          </div>
        </>
      )}
      {first && here && (
        <div data-testid="compare" data-equal={String(equal)}>
          <div className="compare">
            <div>
              <div className="fp-label">first device</div>
              <KeyRail label="First device rail" origin="first device" large namespaces={[{ path: first.path, fingerprint: first.fp }]} />
              <div className={equal ? "rail-fp-rule" : "rail-fp-rule rail-fp-rule-bad"} />
            </div>
            <div>
              <div className="fp-label">this device</div>
              <KeyRail label="This device rail" origin="this device passkey" large {...(s.credential ? { credentialId: s.credential.credentialId } : {})} namespaces={[{ path: MEMORY_NS, fingerprint: here }]} />
              <div className={equal ? "rail-fp-rule" : "rail-fp-rule rail-fp-rule-bad"} />
            </div>
          </div>
          <p className="status-line">
            <span className={equal ? "badge-ok" : "badge-err"}>{equal ? "equal" : "different"}</span>
            <span>{equal ? "Same passkey, same keys: the fingerprints match." : "These fingerprints differ: this device opened a different passkey."}</span>
          </p>
        </div>
      )}
    </div>
  );
}
export const CrossDevicePanel = () => <Live>{(s) => <CrossDeviceBody s={s} />}</Live>;
