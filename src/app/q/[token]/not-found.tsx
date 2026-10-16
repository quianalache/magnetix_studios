import { Link2Off } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

/** Invalid or replaced quote / invoice link (re-sending a quote mints a new link). */
export default function QuoteLinkNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Link not valid"
      icon={Link2Off}
      tone="warning"
      title="This link isn't valid"
      description="It may have expired or been replaced by a newer one. Ask the sender to share it again."
    />
  );
}
