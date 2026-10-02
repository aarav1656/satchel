"use client";

import { useState } from "react";
import { enrol, ns, open, type Satchel } from "@satchel/sdk";
import { failure } from "@/lib/errors-ui";
import { promptCount, usePromptCount } from "@/lib/prompts";

const CRED = "satchel.quickstart.credential";

type Out = { lines: { text: string; tone?: "err" | "dim" }[] };

/** Runs the quickstart's five lines against this page's own passkey. The first run creates the passkey (enrol), later runs reuse it (open). */
export function QuickstartRun() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out | undefined>();
  const prompts = usePromptCount();

  const run = async () => {
    setBusy(true);
    const before = promptCount();
    let s: Satchel | undefined;
    try {
      const rpId = location.hostname;
      const stored = localStorage.getItem(CRED);
      if (stored) s = await open({ rpId, credential: JSON.parse(stored) as NonNullable<Satchel["credential"]> });
      else {
        s = await enrol({ rpId, appName: "Satchel quickstart" });
        if (s.credential) localStorage.setItem(CRED, JSON.stringify(s.credential));
      }
      const memory = ns("memory/assistant");
      const blob = await s.seal(memory, { likes: "metric units" });
      const back = await s.unsealJson<{ likes: string }>(memory, blob);
      const used = promptCount() - before;
      setOut({
        lines: [
          { text: `sealed  ns=memory/assistant  epoch=${blob.epoch}  ${blob.toBytes().length} B  fp=${await s.fingerprint(memory)}  (${used} prompt${used === 1 ? "" : "s"})` },
          { text: `unsealed  ${JSON.stringify(back)}`, tone: "dim" },
        ],
      });
    } catch (e) {
      const f = failure(e);
      setOut({ lines: [{ text: `${f.code}  ${f.message}`, tone: "err" }, ...(f.fix ? [{ text: `fix: ${f.fix}`, tone: "dim" as const }] : [])] });
    } finally {
      s?.close();
      setBusy(false);
    }
  };

  return (
    <div className="proof-live">
      <div className="btn-row" style={{ marginTop: "var(--s-3)" }}>
        <button type="button" className="btn" disabled={busy} onClick={() => void run()} data-testid="quickstart-run">
          {busy ? "Waiting for your passkey." : "Run it in this page"}
        </button>
        <span className="small muted">Passkey prompts on this page so far: {prompts}</span>
      </div>
      {out && (
        <div className="terminal" data-testid="quickstart-output">
          {out.lines.map((l, i) => (
            <div key={i} className={l.tone}>
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
