import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { Doc } from "@/components/Doc";
import { errorAnchor, SECTIONS } from "@/lib/reference";

export const metadata: Metadata = { title: "API reference" };

export default function Page() {
  return (
    <Doc>
      <h1>API reference</h1>
      <p>
        Everything exported from <code>@satchel/sdk</code>: three functions to start, one session interface, and the types around them. Each function lists the error codes it can throw, linked to the <Link href="/reference/errors/">error table</Link>.
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title}>
          <h2 id={section.title.toLowerCase().replaceAll(" ", "-")}>{section.title}</h2>
          <p>{section.blurb}</p>
          {section.entries.map((e) => (
            <article className="api-entry" key={e.name}>
              <h3 id={e.anchor}>{e.name}</h3>
              <div className="api-kind">{e.kind}</div>
              <p>{e.summary}</p>
              <CodeBlock code={e.signature} file={e.kind === "method" ? "method" : "signature"} />
              {e.params && (
                <div style={{ marginTop: "var(--s-4)" }}>
                  {e.params.map((p) => (
                    <div className="prop-row" key={p.name}>
                      <div>
                        <code>{p.name}</code> <span className="badge">{p.type}</span>
                      </div>
                      <div className="muted">{p.doc}</div>
                    </div>
                  ))}
                </div>
              )}
              {e.returns && (
                <p className="small">
                  <strong>Returns.</strong> {e.returns}
                </p>
              )}
              {e.throws && (
                <p className="throws" data-testid="throws" data-for={e.name}>
                  <strong>Throws.</strong>{" "}
                  {e.throws.length === 0 ? (
                    <span className="muted">no SatchelError.</span>
                  ) : (
                    <span className="throws-list">
                      {e.throws.map((code) => (
                        <Link key={code} href={errorAnchor(code)}>
                          {code}
                        </Link>
                      ))}
                    </span>
                  )}
                </p>
              )}
            </article>
          ))}
        </section>
      ))}
    </Doc>
  );
}
