import type { Metadata } from "next";
import { FernApp } from "@/components/demo/FernApp";

export const metadata: Metadata = { title: "Fern" };

export default function Page() {
  return <FernApp />;
}
