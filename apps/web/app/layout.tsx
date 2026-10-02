import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import { Mark } from "@/components/Mark";
import { TopNav } from "@/components/Sidebar";
import { REGISTRY_ADDRESS } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "satchel", template: "%s · satchel" },
  description: "One passkey, many namespaced keys. Seal data per app, grant a second app a revocable read, and cut it off with an epoch bump on Monad.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" className="brand">
              <Mark />
              satchel
            </Link>
            <TopNav />
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="footer-inner">
            <span>satchel-sdk, MIT</span>
            <Link href="/proof/">Proof</Link>
            <Link href="/reference/errors/">Error codes</Link>
            <span>Registry {REGISTRY_ADDRESS} on Monad testnet</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
