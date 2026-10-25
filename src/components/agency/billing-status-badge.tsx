"use client";

import {
  effectiveBillingState,
  type EffectiveBillingState,
} from "@/lib/billing/status";
import { StatusPill, type StatusTone } from "@/components/system/status-pill";
import type { SubAccountBilling } from "@/types/billing";

/**
 * Billing state pill (Client Billing v1). Derives the effective state
 * (grace vs lapsed etc.) from the billing field so every surface — the
 * Client billing table, the Manage dialog — shows the same word. Rendered
 * with the system StatusPill (Visual Direction 2) — same hue per state as
 * before: comped neutral, awaiting payment info, active success, past due
 * warning, lapsed danger.
 */

const STYLES: Record<EffectiveBillingState, { label: string; tone: StatusTone }> = {
  comped: { label: "Comped", tone: "neutral" },
  pending: { label: "Awaiting payment", tone: "info" },
  active: { label: "Active", tone: "success" },
  grace: { label: "Past due", tone: "warning" },
  lapsed: { label: "Lapsed", tone: "danger" },
};

export function BillingStatusBadge({
  billing,
  className,
}: {
  billing: SubAccountBilling | null | undefined;
  className?: string;
}) {
  const style = STYLES[effectiveBillingState(billing)];
  return (
    <StatusPill tone={style.tone} className={className}>
      {style.label}
    </StatusPill>
  );
}
