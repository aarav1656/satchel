import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "await", "async", "function", "return", "type", "interface", "class",
  "new", "try", "catch", "throw", "if", "else", "for", "of", "in", "as", "extends", "readonly", "typeof", "instanceof",
]);

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b[A-Za-z_$][\w$]*\b)/g;

function line(src: string, key: number): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of src.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(src.slice(last, at));
    if (m[1]) out.push(<span key={i++} className="tok-c">{m[1]}</span>);
    else if (m[2]) out.push(<span key={i++} className="tok-s">{m[2]}</span>);
    else if (m[3] && KEYWORDS.has(m[3])) out.push(<span key={i++} className="tok-k">{m[3]}</span>);
    else out.push(m[3]);
    last = at + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return <span key={key}>{out}</span>;
}

/** Tiny tokenizer: comments, strings, keywords. Enough to read TypeScript, no dependency. "diff" tints added and removed lines. */
export function highlight(code: string, lang: string): ReactNode {
  const lines = code.split("\n");
  return lines.map((l, i) => {
    const nl = i < lines.length - 1 ? "\n" : "";
    if (lang === "diff") {
      if (l.startsWith("+") && !l.startsWith("+++")) return <span key={i} className="tok-add">{l}{nl}</span>;
      if (l.startsWith("-") && !l.startsWith("---")) return <span key={i} className="tok-del">{l}{nl}</span>;
      if (l.startsWith("@@") || l.startsWith("---") || l.startsWith("+++")) return <span key={i} className="tok-c">{l}{nl}</span>;
      return <span key={i}>{l}{nl}</span>;
    }
    if (lang === "ts" || lang === "tsx" || lang === "js") return <span key={i}>{line(l, i)}{nl}</span>;
    return <span key={i}>{l}{nl}</span>;
  });
}
