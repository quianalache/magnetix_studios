import { Tag, type TagColor } from "@/components/system/status-pill";
import type { ContactSource } from "@/types/contacts";

/**
 * Visual badge for a contact's source. Known sources get an explicit
 * label + color; UTM-derived values (e.g. "google", "newsletter") that
 * flow through from form submissions render as a neutral capitalised
 * label so reporting still surfaces them without crashing the table.
 */

const LABELS: Record<Exclude<ContactSource, "">, string> = {
  "website-form": "Website Form",
  "web-chat": "Web Chat",
  "booking-page": "Booking",
  community: "Community",
  "get-leads": "Get Leads",
  website: "Website",
  referral: "Referral",
  ads: "Ads",
  other: "Other",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Inbound Email",
};

/** Source → categorical tag colour (approved tag palette, Wave 2). */
const COLORS: Record<Exclude<ContactSource, "">, TagColor> = {
  "website-form": "blue",
  "web-chat": "violet",
  "booking-page": "aqua",
  community: "gold",
  "get-leads": "aqua",
  website: "blue",
  referral: "green",
  ads: "gold",
  other: "gray",
  facebook: "blue",
  instagram: "pink",
  email: "violet",
};

/**
 * Display label for a source value — known sources get their explicit
 * label, UTM-derived values get capitalised, empty gets "Unspecified".
 * Shared with the attribution report so table rows and badges agree.
 */
export function sourceLabel(source: ContactSource | string): string {
  const known = LABELS[source as Exclude<ContactSource, "">];
  if (known) return known;
  if (typeof source === "string" && source.length > 0) {
    return source.charAt(0).toUpperCase() + source.slice(1);
  }
  return "Unspecified";
}

export function SourceBadge({ source }: { source: ContactSource }) {
  if (!source) {
    return <span className="text-caption text-muted-foreground">—</span>;
  }
  return <Tag color={COLORS[source as Exclude<ContactSource, "">] ?? "gray"}>{sourceLabel(source)}</Tag>;
}
