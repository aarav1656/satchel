"use client";

import { useState } from "react";
import type { Sealed, Satchel } from "@satchel/sdk";
import { failure } from "@/lib/errors-ui";
import { promptCount, usePromptCount } from "@/lib/prompts";
import { runSnippet } from "@/lib/run-snippet";
import { QUICKSTART } from "@/lib/snippets";

type Out = { lines: { text: string; tone?: "err" | "dim" }[] };

/** Executes QUICKSTART, the same constant the page shows above this button. The first run creates the passkey, later runs open it. */
export function QuickstartRun() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Out | undefined>();
  const prompts = usePromptCount();

  const run = async () => {
    setBusy(true);
    const before = promptCount();
    let s: Satchel | undefined;
    try {
      const { values, sha256 } = await runSnippet(QUICKSTART, ["s", "memory", "blob", "back"]);
      s = values.s as Satchel;
      const blob = values.blob as Sealed;
      const used = promptCount() - before;
      setOut({
        lines: [
          { text: `sealed  ns=memory/assistant  epoch=${blob.epoch}  ${blob.toBytes().length} B  fp=${await s.fingerprint(values.memory as Parameters<Satchel["fingerprint"]>[0])}  (${used} prompt${used === 1 ? "" : "s"})` },
          { text: `unsealed  ${JSON.stringify(values.back)}`, tone: "dim" },
          { text: `ran the code above verbatim, sha256 ${sha256.slice(0, 12)}`, tone: "dim" },
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
          {busy ? "Waiting for your passkey." : "Run the code above"}
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
