import { SearchX } from "lucide-react";
import { CUSTOM_BRAND } from "@/config/landing";
import { PublicAction, PublicStateShell } from "@/components/public/public-shell";
import type { Metadata } from "next";

/** The not-found render takes this boundary's metadata (the page's is dropped). */
export const metadata: Metadata = { title: "Page not found" };

/** Every notFound() without a closer boundary: the Magnetix public state card instead of the bare Next.js 404. */
export default function NotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Page not found"
      icon={SearchX}
      tone="brand"
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      action={<PublicAction href="/">Go to {CUSTOM_BRAND.name}</PublicAction>}
    />
  );
}
