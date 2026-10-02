import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Toc } from "./Toc";

export function Doc({ children }: { children: ReactNode }) {
  return (
    <div className="docs">
      <Sidebar />
      <main className="doc-main">{children}</main>
      <Toc />
    </div>
  );
}

export function Callout({ children, tone }: { children: ReactNode; tone?: "warn" | "error" }) {
  return <div className={`callout${tone ? ` callout-${tone}` : ""}`}>{children}</div>;
}
