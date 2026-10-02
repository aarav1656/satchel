"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function AppBar({ app, links }: { app: "Pip" | "Fern"; links: { href: string; label: string }[] }) {
  const path = norm(usePathname());
  return (
    <div className="app-bar">
      <div className="app-bar-inner">
        <span className="app-name">
          <span className={app === "Pip" ? "app-dot" : "app-dot app-dot-open"} aria-hidden="true" />
          {app}
        </span>
        <span className="muted">{app === "Pip" ? "an assistant that holds the passkey and seals its memory" : "a second app that reads that memory through a grant"}</span>
        <nav aria-label={`${app} pages`}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={norm(l.href.split("?")[0] ?? l.href) === path ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
