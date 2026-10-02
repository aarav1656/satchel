"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DOCS_NAV, TOP_NAV } from "@/lib/nav";

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function Sidebar() {
  const path = norm(usePathname());
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  const current = DOCS_NAV.flatMap((g) => g.items).find((i) => norm(i.href) === path);
  return (
    <aside className="sidebar" aria-label="Documentation" data-open={open ? "true" : "false"}>
      <button type="button" className="sidebar-toggle" aria-expanded={open} aria-controls="docs-menu" onClick={() => setOpen((o) => !o)}>
        <span>{current?.label ?? "Docs menu"}</span>
        <span aria-hidden="true">{open ? "Close" : "Menu"}</span>
      </button>
      <div id="docs-menu" className="sidebar-groups">
        {DOCS_NAV.map((g) => (
          <div className="sidebar-group" key={g.title}>
            <div className="sidebar-title">{g.title}</div>
            {g.items.map((i) => (
              <Link key={i.href} href={i.href} aria-current={norm(i.href) === path ? "page" : undefined}>
                {i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}

export function TopNav() {
  const path = norm(usePathname());
  const section = (href: string) => (href === "/" ? !path.startsWith("/pip/") && !path.startsWith("/fern/") && !path.startsWith("/proof/") : path.startsWith(norm(href)));
  return (
    <nav className="top-nav" aria-label="Site">
      {TOP_NAV.map((i) => (
        <Link key={i.href} href={i.href} aria-current={section(i.href) ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
