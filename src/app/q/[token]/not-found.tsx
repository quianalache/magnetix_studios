import type { Metadata } from "next";
import { Link2Off } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

export const metadata: Metadata = { title: "Link not valid" };

/** Invalid or replaced quote / invoice link (re-sending a quote mints a new link). */
export default function QuoteLinkNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      icon={Link2Off}
      tone="warning"
      title="This link isn't valid"
      description="It may have expired or been replaced by a newer one. Ask the sender to share it again."
    />
  );
}
