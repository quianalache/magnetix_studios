import { Link2Off } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

/** Invalid, rotated or forged booking-management link. No business is named: the token didn't verify. */
export default function BookingLinkNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      documentTitle="Booking link not valid"
      icon={Link2Off}
      tone="warning"
      title="This booking link isn't valid"
      description="It may have expired or been replaced — the link changes each time a booking is rescheduled. Use the link in your most recent confirmation email."
    />
  );
}
