import { FileX2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";
import type { Metadata } from "next";

/** The not-found render takes this boundary's metadata (the page's is dropped). */
export const metadata: Metadata = { title: "Form not available" };


export default function FormNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Form not available"
      icon={FileX2}
      tone="warning"
      title="This form isn't available"
      description="It may have been removed. Check the link with whoever shared it."
    />
  );
}
