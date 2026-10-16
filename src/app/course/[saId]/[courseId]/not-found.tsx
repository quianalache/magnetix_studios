import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

export const metadata: Metadata = { title: "Page not available" };


export default function SalesPageNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      icon={SearchX}
      tone="warning"
      title="This page isn't available"
      description="It may have been unpublished or moved. Check the link with whoever shared it."
    />
  );
}
