import { CalendarX } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

export const metadata = { title: "Webinar not available" };

export default function WebinarNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Webinar not available"
      icon={CalendarX}
      title="This webinar isn't available"
      description="It may have been removed, or the link is incomplete. Check the link you were sent, or ask the host for a new one."
    />
  );
}
