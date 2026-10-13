"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseSealed } from "satchel-sdk";
import { toBytes } from "viem";
import { credential, grants, memories } from "@/lib/demo-store";

type LinkState = "none" | "active" | "cut";
interface State {
  vault: boolean;
  memories: number;
  epoch: number;
  link: LinkState;
}

const read = (): State => {
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

/** The two apps and the grant between them. The status lines and the line itself are read from this browser's own state. */
export function HomeStage() {
  const [s, setS] = useState<State | undefined>();
  useEffect(() => setS(read()), []);

  const pip = !s ? "" : !s.vault ? "No vault on this device yet." : s.memories === 0 ? "Vault on this device. Nothing sealed yet." : `${plural(s.memories, "memory", "memories")} sealed at epoch ${s.epoch}.`;
  const fern = !s ? "" : s.link === "none" ? "No grant. Fern sees nothing." : s.link === "active" ? "Holds a grant. Reads and plans from your memory." : "Revoked. Its grant opens nothing now.";

  return (
    <section className="stage" aria-label="Pip and Fern share one memory">
      <article className="app-panel" data-testid="home-pip">
        <header>
          <span className="app-dot" aria-hidden="true" />
          <h2>Pip</h2>
          <span className="muted small">holds the passkey</span>
        </header>
        <p className="app-panel-lede">Tell Pip what lasts about you. A model picks out each fact and Pip seals it on your device before it is stored.</p>
        <blockquote className="app-panel-quote">I&apos;m vegetarian and I fly out of BLR.</blockquote>
        <p className="app-panel-status" data-testid="home-pip-status">{pip}</p>
        <div className="btn-row">
          <Link href="/pip/" className="btn">
            Open Pip
          </Link>
        </div>
      </article>

      <div className="stage-link" data-state={s?.link ?? "none"} data-testid="home-link" aria-hidden="true">
        <span className="stage-link-chip">{s?.link === "cut" ? "revoked" : s?.link === "active" ? "read grant" : "grant"}</span>
      </div>

      <article className="app-panel" data-testid="home-fern">
        <header>
          <span className="app-dot app-dot-open" aria-hidden="true" />
          <h2>Fern</h2>
          <span className="muted small">reads through a grant</span>
        </header>
        <p className="app-panel-lede">Ask Fern to plan your weekend. It opens Pip&apos;s memories with its own key and plans around them. Take the grant away and it plans without them.</p>
        <blockquote className="app-panel-quote">Plan my weekend.</blockquote>
        <p className="app-panel-status" data-testid="home-fern-status">{fern}</p>
        <div className="btn-row">
          <Link href="/fern/" className="btn btn-secondary">
            Open Fern
          </Link>
        </div>
      </article>
    </section>
  );
}
