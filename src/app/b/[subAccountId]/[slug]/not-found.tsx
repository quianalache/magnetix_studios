import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

export const metadata: Metadata = { title: "Booking page not available" };


export default function BookingPageNotFound() {
  return (
    <PublicStateShell
      variant={{ kind: "magnetix" }}
      icon={CalendarX2}
      tone="warning"
      title="This booking page isn't available"
      description="It may have been unpublished or moved. Check the link with whoever shared it."
    />
  );
}
