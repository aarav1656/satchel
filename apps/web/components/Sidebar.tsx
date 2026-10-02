"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOCS_NAV, TOP_NAV } from "@/lib/nav";

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

export function Sidebar() {
  const path = norm(usePathname());
  return (
    <aside className="sidebar" aria-label="Documentation">
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
