import { StatusPill, type StatusTone } from "@/components/system/status-pill";
import type { QuoteStatus } from "@/types/quotes";

/**
 * Status pill for a quote / invoice — the shared system StatusPill, so the
 * same state reads the same colour everywhere (list rows, detail header,
 * contact profile). Driven by `effectiveQuoteStatus()` (not the raw stored
 * status) so an unaccepted quote past its validUntil date displays as
 * "Expired" even before any write has happened.
 */
const STATUS: Record<QuoteStatus, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "scheduled" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  expired: { label: "Expired", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
};

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <StatusPill tone={s.tone} className={className}>
      {s.label}
    </StatusPill>
  );
}
