import { highlight } from "@/lib/highlight";
import { CopyButton } from "./CopyButton";

export function CodeBlock({ code, lang = "ts", file }: { code: string; lang?: string; file?: string }) {
  const text = code.replace(/\n$/, "");
  return (
    <div className="codeblock">
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
