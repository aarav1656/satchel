import type { Metadata } from "next";
import { Suspense } from "react";
import { ShareApp } from "@/components/demo/ShareApp";

export const metadata: Metadata = { title: "Pip sharing" };

export default function Page() {
  return (
    <Suspense>
      <ShareApp />
    </Suspense>
  );
}
