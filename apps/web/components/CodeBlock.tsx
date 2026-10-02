import { highlight } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

/** `snippet` marks a block whose text is also executed or checked elsewhere: it is written to the page as data-snippet so scripts/check-built.mjs can find it. */
export function CodeBlock({ code, lang = "ts", file, snippet }: { code: string; lang?: string; file?: string; snippet?: string }) {
  const text = code.replace(/\n$/, "");
  return (
    <div className="codeblock" {...(snippet ? { "data-snippet": snippet } : {})}>
      <div className="codeblock-head">
        <span>{file ?? lang}</span>
        <CopyButton text={text} />
      </div>
      <pre>
        <code>{highlight(text, lang)}</code>
      </pre>
    </div>
  );
}
