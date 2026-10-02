import type { Metadata } from "next";
import Link from "next/link";
import { Doc } from "@/components/Doc";
import { ERROR_DOCS } from "@/lib/error-docs";
import { ENTRIES } from "@/lib/reference";
import { ns, parseSealed, SatchelError, type ErrorCode } from "@satchel/sdk";

export const metadata: Metadata = { title: "Error codes" };

/** The fix and docs path come from constructing the real SatchelError, so this page cannot disagree with the SDK build. */
const info = (code: ErrorCode) => {
  const e = new SatchelError(code, "");
  return { fix: e.fix, docs: e.docs };
};

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

const CODES = Object.keys(ERROR_DOCS) as ErrorCode[];
const thrownBy = (code: ErrorCode) => ENTRIES.filter((e) => e.throws?.includes(code)).map((e) => e.name);

export default function Page() {
  const seen = captured();
  return (
    <Doc>
      <h1>Error codes</h1>
      <p>
        Every failure the SDK raises is a <code>SatchelError</code> with a <code>code</code>, a cause in the message, a <code>fix</code> and a <code>docs</code> path to its entry here. The fix text on this page is read from the SDK build, not retyped.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Code</th><th>Raised by</th></tr>
          </thead>
          <tbody>
            {CODES.map((c) => (
              <tr key={c}>
                <td><a href={`#${info(c).docs.split("#")[1]}`}><code>{c}</code></a></td>
                <td className="muted">{ERROR_DOCS[c].where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {CODES.map((c) => {
        const { fix, docs } = info(c);
        const id = docs.split("#")[1];
        return (
          <article className="api-entry" key={c}>
            <h3 id={id} data-testid="error-code">{c}</h3>
            <p>{ERROR_DOCS[c].cause}</p>
            <p className="small"><strong>Fix.</strong> {fix}</p>
            <p className="small muted">
              Thrown by{" "}
              {thrownBy(c).map((n, i) => (
                <span key={n}>
                  {i > 0 && ", "}
                  <Link href={`/reference/api/#${ENTRIES.find((e) => e.name === n)?.anchor}`}>{n}</Link>
                </span>
              ))}
              {thrownBy(c).length === 0 && "no documented function"}.
            </p>
            {seen[c] && (
              <div className="terminal">
                <div>{c}  {seen[c]}</div>
                <div className="dim">fix: {fix}</div>
                <div className="dim">docs: {docs}</div>
              </div>
            )}
          </article>
        );
      })}
    </Doc>
  );
}
