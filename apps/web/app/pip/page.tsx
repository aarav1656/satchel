import type { Metadata } from "next";
import { PipApp } from "@/components/demo/PipApp";

export const metadata: Metadata = { title: "Pip" };

export default function Page() {
  return <PipApp />;
}
