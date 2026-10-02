import type { Metadata } from "next";
import { Suspense } from "react";
import { FernApp } from "@/components/demo/FernApp";

export const metadata: Metadata = { title: "Fern" };

export default function Page() {
  return (
    <Suspense>
      <FernApp />
    </Suspense>
  );
}
