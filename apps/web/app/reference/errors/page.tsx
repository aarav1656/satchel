import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/Doc";
import { errorRows } from "@/lib/error-docs";
import { ns, parseSealed, SatchelError, type ErrorCode } from "satchel-sdk";

export const metadata: Metadata = { title: "Error codes" };

/** Messages captured by calling the SDK during the site build. */
function captured(): Partial<Record<ErrorCode, string>> {
  const out: Partial<Record<ErrorCode, string>> = {};
  const catching = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      if (e instanceof SatchelError) out[e.code] = e.message;
      else throw e;
    }
  };
  catching(() => ns("Memory/Assistant"));
  catching(() => parseSealed(new Uint8Array(8)));
  const header = new Uint8Array(60);
  header.set([0x53, 0x41, 0x54, 0x31, 1]);
  new DataView(header.buffer).setBigUint64(37, 1n, false);
  catching(() => parseSealed(header));
  return out;
}

const names = (row: { thrownBy: { name: string; anchor: string }[] }) =>
  row.thrownBy.length === 0 ? (
    "no documented function"
  ) : (
    row.thrownBy.map((t, i) => (
      <span key={t.name}>
        {i > 0 && ", "}
        <Link href={`/reference/api/#${t.anchor}`}>{t.name}</Link>
      </span>
    ))
  );

export default function Page() {
  const seen = captured();
  const rows = errorRows();
  return (
    <Doc>
      <h1>Error codes</h1>
      <p>
        Every failure the SDK raises is a <code>SatchelError</code> with a <code>code</code>, a cause in the message, a <code>fix</code> and a <code>docs</code> path to its entry here. The fix text on this page is read from the SDK build, not retyped, and the summary table and the entries below are drawn from the same rows.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Thrown by</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} data-testid="error-summary-row" data-code={r.code}>
                <td><a href={`#${r.anchor}`}><code>{r.code}</code></a></td>
                <td className="muted">{names(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.map((r) => (
        <article className="api-entry" key={r.code} data-testid="error-detail" data-code={r.code}>
          <h3 id={r.anchor} data-testid="error-code">{r.code}</h3>
          <p>{r.cause}</p>
          <p className="small"><strong>Fix.</strong> {r.fix}</p>
          <p className="small muted">Thrown by {names(r)}.</p>
          {seen[r.code] && (
            <div className="terminal">
              <div>{r.code}  {seen[r.code]}</div>
              <div className="dim">fix: {r.fix}</div>
              <div className="dim">docs: {r.docs}</div>
            </div>
          )}
        </article>
      ))}
    </Doc>
  );
}
