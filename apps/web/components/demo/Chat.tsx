"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface SealedNote {
  text: string;
  epoch: number;
  size: number;
}
export interface ChatTurn {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Facts Pip sealed while producing this turn. */
  sealed?: SealedNote[];
  /** What Fern could open for this turn. */
  read?: { open: number; locked: number; code?: string };
}

interface Props {
  who: string;
  turns: ChatTurn[];
  busy: boolean;
  /** Why typing is off, shown instead of the box. */
  gate?: ReactNode;
  placeholder: string;
  suggestions: string[];
  onSend: (text: string) => void;
  testid: string;
}

/** A transcript, not bubbles: one row per turn, a role label, hairlines between. */
export function Chat({ who, turns, busy, gate, placeholder, suggestions, onSend, testid }: Props) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns.length, busy]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft("");
    onSend(t);
  };

  return (
    <section className="chat" aria-label={`Chat with ${who}`} data-testid={testid}>
      <div className="chat-log" role="log" aria-live="polite">
        {turns.length === 0 && (
          <div className="chat-empty">
            <p>{gate ? `${who} is waiting for the vault.` : `Say something to ${who}.`}</p>
            {!gate && (
              <div className="chat-suggest">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {turns.map((t) => (
          <div className={`turn turn-${t.role}`} key={t.id} data-testid="turn" data-role={t.role}>
            <div className="turn-who">{t.role === "user" ? "You" : t.role === "assistant" ? who : "System"}</div>
            <div className="turn-body">
              <p>{t.content}</p>
              {t.read && (
                <p className="turn-read" data-testid="turn-read" data-open={t.read.open} data-locked={t.read.locked}>
                  <span className={t.read.locked > 0 ? "badge-err" : "badge-ok"}>{t.read.locked > 0 ? t.read.code ?? "locked" : "read"}</span>
                  <span>
                    opened {t.read.open} of {t.read.open + t.read.locked} {t.read.open + t.read.locked === 1 ? "memory" : "memories"}
                  </span>
                </p>
              )}
              {t.sealed?.map((n, i) => (
                <p className="turn-sealed" key={i} data-testid="turn-sealed">
                  <span className="badge-ok">sealed</span>
                  <span>{n.text}</span>
                  <span className="mono muted">
                    e{n.epoch} {n.size} B
                  </span>
                </p>
              ))}
            </div>
          </div>
        ))}
        {busy && (
          <div className="turn turn-assistant" aria-live="off">
            <div className="turn-who">{who}</div>
            <div className="turn-body">
              <p className="muted" data-testid="thinking">
                Thinking
              </p>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {gate ? (
        <div className="chat-gate">{gate}</div>
      ) : (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <label className="sr-only" htmlFor={`${testid}-input`}>
            Message to {who}
          </label>
          <input id={`${testid}-input`} className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} autoComplete="off" maxLength={900} disabled={busy} />
          <button type="submit" className="btn" disabled={busy || draft.trim() === ""}>
            Send
          </button>
        </form>
      )}
    </section>
  );
}
