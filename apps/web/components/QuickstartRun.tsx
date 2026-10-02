"use client";

import { useEffect, useState } from "react";
import { rememberedPasskey, type PasskeyMode, type Satchel, type Sealed } from "satchel-sdk";
import { failure } from "@/lib/errors-ui";
import { promptCount, usePromptCount } from "@/lib/prompts";
import { runSnippet } from "@/lib/run-snippet";
import { QUICKSTART } from "@/lib/snippets";

type Out = { lines: { text: string; tone?: "err" | "dim" }[] };

/**
 * Executes QUICKSTART, the same constant the page shows above the buttons. On a first visit the page asks which passkey
 * ceremony the person wants, one button each, so every click runs exactly one WebAuthn prompt: "Create a passkey" is
 * mode "enrol", "I already have one" is mode "open". Once this browser remembers a passkey there is one button.
 */
export function QuickstartRun() {
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState<boolean | undefined>();
  const [out, setOut] = useState<Out | undefined>();
  const prompts = usePromptCount();

  const refresh = async () => {
    try {
      setKnown((await rememberedPasskey({ rpId: location.hostname })) !== undefined);
    } catch {
      setKnown(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (mode: PasskeyMode) => {
    setBusy(true);
    const before = promptCount();
    let s: Satchel | undefined;
    try {
      const { values, sha256 } = await runSnippet(QUICKSTART, ["s", "memory", "blob", "back"], { mode });
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
      await refresh();
      setBusy(false);
    }
  };

  return (
    <div className="proof-live">
      <div className="btn-row" style={{ marginTop: "var(--s-3)" }}>
        {known === undefined && <span className="small muted">Looking for a passkey on this browser.</span>}
        {known === false && (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => void run("enrol")} data-testid="quickstart-create">
              {busy ? "Waiting for your passkey." : "Create a passkey"}
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run("open")} data-testid="quickstart-open">
              I already have one
            </button>
          </>
        )}
        {known === true && (
          <button type="button" className="btn" disabled={busy} onClick={() => void run("open")} data-testid="quickstart-run">
            {busy ? "Waiting for your passkey." : "Run the code above"}
          </button>
        )}
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
