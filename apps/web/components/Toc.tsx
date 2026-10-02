"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Reads the h2 headings from the rendered page, so the list cannot drift from the prose. */
export function Toc() {
  const path = usePathname();
  const [items, setItems] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    setItems([...document.querySelectorAll<HTMLElement>(".doc-main h2[id]")].map((h) => ({ id: h.id, label: h.textContent ?? "" })));
  }, [path]);
  if (items.length === 0) return <div className="toc" />;
  return (
    <nav className="toc" aria-label="On this page">
      <div className="toc-title">On this page</div>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
