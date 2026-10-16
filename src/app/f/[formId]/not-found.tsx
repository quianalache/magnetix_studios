import type { Metadata } from "next";
import { FileX2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

export const metadata: Metadata = { title: "Form not available" };


export default function FormNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      icon={FileX2}
      tone="warning"
      title="This form isn't available"
      description="It may have been removed. Check the link with whoever shared it."
    />
  );
}
