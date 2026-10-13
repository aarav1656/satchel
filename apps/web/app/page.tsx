"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseSealed } from "satchel-sdk";
import { toBytes } from "viem";
import { monadTestnet } from "viem/chains";
import { credential, grants, memories } from "@/lib/demo-store";

type LinkState = "none" | "active" | "cut";
interface Live {
  vault: boolean;
  memories: number;
  epoch: number;
  link: LinkState;
}

/** What this browser holds right now: the same reads the Pip and Fern pages make from their own storage. */
const readLive = (): Live => {
  const gs = grants.list();
  const list = memories.list();
  const epochs = list.map((m) => parseSealed(toBytes(m.hex)).epoch);
  const last = gs[gs.length - 1];
  return {
    vault: credential.get() !== undefined,
    memories: list.length,
    epoch: epochs.length ? Math.max(...epochs) : 1,
    link: !last ? "none" : last.revoked ? "cut" : "active",
  };
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Step = 1 | 2 | 3 | 4;
type View = LinkState;
const VIEW: Record<Step, View> = { 1: "none", 2: "active", 3: "active", 4: "cut" };
const DWELL_MS = 4200;

const STEPS: { title: string; body: string }[] = [
  { title: "Tell Pip two things that last.", body: "“I’m vegetarian.” “I fly out of BLR.” Each one is sealed with your passkey and shown with its epoch." },
  { title: "Allow Fern.", body: "One passkey prompt and one transaction on Monad. Fern gets its own key to that folder, read only." },
  { title: "Ask Fern to plan your weekend.", body: "It opens the memories and plans around them: vegetarian, out of BLR." },
  { title: "Revoke Fern.", body: "Pip seals every memory again at the next epoch. Fern’s next read comes back GRANT_REVOKED and it plans without them." },
];

/** The sample story's two memories. The ciphertext heads are the first and last bytes of two rows Pip sealed in the recorded run. */
const FACTS = [
  { plain: "Vegetarian", cipher: "0x53415431…14e125", resealed: "0x53415431…9d41c0" },
  { plain: "Flies out of BLR", cipher: "0x53415431…caba35", resealed: "0x53415431…e07b58" },
];

/** The recorded run's registry reads, taken with viem against the Monad testnet RPC at block 70657080 (results/assistant-onchain-live-2026-10-13.txt). */
const RECEIPTS = [
  { kind: "grant", event: "Allow Fern", read: ["grant 37", "active", "epoch 1"], block: 70656985, tx: "0x1ef48ed075c60b6046372bf24d616f8f7af8e4d2fffc62025cf6d4d0eb737116" },
  { kind: "revoke", event: "Revoke Fern", read: ["grant 37", "inactive", "folder at epoch 2"], block: 70657023, tx: "0xcdf08e19626ef9f1c1bb68722b1a65edb8f68ae9f9ef2af3e91d5c6205bc0d6b" },
  { kind: "grant", event: "Allow Fern again", read: ["grant 38", "active", "epoch 2"], block: 70657064, tx: "0x2527b5a521cdb9dcb526262a4e3b982442c5f272d0c1962f9e7ff72a449b5b5c" },
] as const;
const EXPLORER = monadTestnet.blockExplorers.default.url;
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function Envelope({ open, bad }: { open: boolean; bad?: boolean }) {
  return (
    <span className="env" data-open={open} data-bad={bad ? "true" : "false"} aria-hidden="true">
      <span className="env-back" />
      <span className="env-letter" />
      <span className="env-front" />
      <span className="env-flap" />
      <span className="env-seal" />
    </span>
  );
}

function Epoch({ label, values, className }: { label: string; values: [number, number]; className?: string }) {
  return (
    <span className="epoch">
      <span>{label}</span>
      <span className={`epoch-roll ${className ?? ""}`}>
        <span className="epoch-col">
          <b>{values[0]}</b>
          <b>{values[1]}</b>
        </span>
      </span>
    </span>
  );
}

const LOG: Record<Step, { who: string; text: string; bad?: boolean }[]> = {
  1: [
    { who: "pip", text: "sealed 2 memories on this device" },
    { who: "pip", text: "SAT1 epoch 1, only your passkey opens them" },
  ],
  2: [
    { who: "pip", text: "allow fern, read only" },
    { who: "chain", text: "one transaction on Monad records the grant" },
  ],
  3: [
    { who: "fern", text: "opened 2 of 2 memories with its own key" },
    { who: "fern", text: "plan: vegetarian places, out of BLR" },
  ],
  4: [
    { who: "pip", text: "revoked fern, sealed 2 memories again at epoch 2" },
    { who: "fern", text: "GRANT_REVOKED, opened 0 of 2", bad: true },
  ],
};

export default function Page() {
  const [live, setLive] = useState<Live | undefined>();
  const [step, setStep] = useState<Step>(1);
  const [auto, setAuto] = useState(false);

  useEffect(() => setLive(readLive()), []);

  // A device with no grant plays the story. A device with a real grant rests on the step that matches it.
  useEffect(() => {
    if (!live) return;
    if (live.link === "active") setStep(3);
    else if (live.link === "cut") setStep(4);
    else setAuto(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [live]);

  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => setStep((s) => ((s % 4) + 1) as Step), DWELL_MS);
    return () => window.clearTimeout(id);
  }, [auto, step]);

  const pick = (n: Step) => {
    setAuto(false);
    setStep(n);
  };

  const view = VIEW[step];
  const open = step === 3;
  const revoked = step === 4;
  const epoch = revoked ? 2 : 1;
  const pip = !live ? "" : !live.vault ? "No vault on this device yet." : live.memories === 0 ? "Vault on this device. Nothing sealed yet." : `${plural(live.memories, "memory", "memories")} sealed at epoch ${live.epoch}.`;
  const fern = !live ? "" : live.link === "none" ? "No grant. Fern sees nothing." : live.link === "active" ? "Holds a grant. Reads and plans from your memory." : "Revoked. Its grant opens nothing now.";

  return (
    <main className="home">
      <section className="home-hero">
        <h1>Your assistant&apos;s memory, sealed to your passkey.</h1>
        <div className="home-hero-foot">
          <p>You choose which apps read it, and revoke ends it.</p>
          <div className="btn-row">
            <Link href="/pip/" className="btn">
              Try it with Pip
            </Link>
            <Link href="/docs/" className="btn btn-secondary">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <div className="home-body">
        <ol className="steps" data-auto={auto ? "true" : "false"} aria-label="One minute with both apps">
          {STEPS.map((s, i) => {
            const n = (i + 1) as Step;
            return (
              <li key={s.title} className="step" aria-current={step === n ? "step" : undefined} data-revoke={n === 4 ? "true" : "false"}>
                <button type="button" onClick={() => pick(n)}>
                  <span className="step-title">{s.title}</span>
                  <span className="step-body">{s.body}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <section className="stage" data-view={view} data-step={step} aria-label="Pip and Fern share one memory">
          <p className="stage-cap">
            <span>sample memories, step {step} of 4</span>
            <span>{auto ? "playing" : "paused"}</span>
          </p>
          <div className="stage-grid">
            <article className="app-panel" data-testid="home-pip">
              <header>
                <span className="app-dot" aria-hidden="true" />
                <h2>Pip</h2>
                <span className="muted small">holds the passkey</span>
              </header>
              <div className="panel-meta">
                <span>folder</span>
                <Epoch label="epoch" values={[1, 2]} className="epoch-roll-pip" />
              </div>
              <ul className="tiles" aria-label="Pip&apos;s sample memories">
                {FACTS.map((f) => (
                  <li key={f.plain} className="tile" data-lock="own" data-bad="false">
                    <Envelope open={false} />
                    <span className="tile-main">
                      <span className="tile-plain">{f.plain}</span>
                      <span className="tile-note">{revoked ? f.resealed : f.cipher}</span>
                    </span>
                    <span className="tile-epoch">e{epoch}</span>
                  </li>
                ))}
              </ul>
              <p className="app-panel-status" data-testid="home-pip-status">{pip}</p>
              <div className="btn-row">
                <Link href="/pip/" className="btn">
                  Open Pip
                </Link>
              </div>
            </article>

            <div className="cable" data-state={live?.link ?? "none"} data-testid="home-link" aria-hidden="true">
              <span className="cable-idle" />
              <span className="cable-seg cable-a" />
              <span className="cable-seg cable-b" />
              <span className="cable-cap cable-cap-a" />
              <span className="cable-cap cable-cap-b" />
              <span className="cable-pulse" />
              <span className="cable-pulse cable-pulse-b" />
              <span className="cable-chip">{view === "cut" ? "revoked" : view === "active" ? "read grant" : "no grant"}</span>
            </div>

            <article className="app-panel" data-testid="home-fern">
              <header>
                <span className="app-dot app-dot-open" aria-hidden="true" />
                <h2>Fern</h2>
                <span className="muted small">reads through a grant</span>
              </header>
              <div className="panel-meta">
                <span>its grant</span>
                <span className="epoch epoch-dead">{view === "none" ? "none" : "epoch 1"}</span>
              </div>
              <ul className="tiles" aria-label="What Fern can open">
                {FACTS.map((f) => (
                  <li key={f.plain} className="tile" data-lock={open ? "false" : "true"} data-bad={revoked ? "true" : "false"}>
                    <Envelope open={open} bad={revoked} />
                    <span className="tile-main">
                      <span className="tile-stack">
                        <span className="tile-plain">{f.plain}</span>
                        <span className="tile-cipher">{revoked ? f.resealed : f.cipher}</span>
                      </span>
                      <span className="tile-stack">
                        <span className="tile-note tile-note-lock">{view === "none" ? "sealed, no key" : "sealed, grant not used yet"}</span>
                        <span className="tile-note tile-note-open">opened with its key</span>
                        <span className="tile-note tile-note-bad">GRANT_REVOKED</span>
                      </span>
                    </span>
                    <span className="tile-epoch">e{epoch}</span>
                  </li>
                ))}
              </ul>
              <p className="app-panel-status" data-testid="home-fern-status">{fern}</p>
              <div className="btn-row">
                <Link href="/fern/" className="btn btn-secondary">
                  Open Fern
                </Link>
              </div>
            </article>
          </div>

          <p className="stage-log" key={step}>
            {LOG[step].map((l) => (
              <span key={l.text}>
                <span className={l.who === "fern" ? "log-who log-who-fern" : "log-who"}>{l.who}</span> <span className={l.bad ? "log-bad" : undefined}>{l.text}</span>
              </span>
            ))}
          </p>
        </section>
      </div>

      <section className="ledger-sec" aria-labelledby="ledger-h">
        <div className="ledger-intro">
          <h2 id="ledger-h">The revoke is a transaction, and the registry remembers it.</h2>
          <p>The recorded run went through the same two apps on Monad testnet. Each row was read back from the registry with viem, not through the SDK, after the transaction mined.</p>
          <p className="ledger-note">Read at block 70657080, chain 10143.</p>
        </div>
        <ol className="ledger">
          {RECEIPTS.map((r) => (
            <li key={r.tx} data-kind={r.kind}>
              <span className="ledger-event">{r.event}</span>
              <a className="ledger-tx" href={`${EXPLORER}/tx/${r.tx}`} target="_blank" rel="noreferrer">
                {short(r.tx)}
              </a>
              <span className="ledger-read">
                <b>{r.read[0]}</b>, {r.read[1]}, {r.read[2]}
              </span>
              <span className="ledger-block">block {r.block}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="home-built">
        <p>
          Both apps are built on <code>satchel-sdk</code>: one passkey, a key per namespace, and read grants that end on a transaction.
        </p>
        <div className="btn-row">
          <Link href="/docs/" className="btn btn-secondary">
            Read the quickstart
          </Link>
          <Link href="/proof/" className="btn btn-secondary">
            See the recorded runs
          </Link>
        </div>
      </section>
    </main>
  );
}
