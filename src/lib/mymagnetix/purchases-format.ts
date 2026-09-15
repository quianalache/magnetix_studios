/**
 * Shared formatting/label helpers for the MyMagnetix Purchases surface
 * (page, subscription cards, payment history table, and both "View
 * details" sheets). Extracted from the original purchases/page.tsx
 * (2026-09-16 mockup refinement) so the page and its new sheet components
 * don't each reimplement the same status-label/currency-formatting logic.
 * Pure, client-safe (no "server-only" import) — used from both the
 * Server Component page and "use client" pieces.
 */
import type {
  PersonPurchaseStatus,
  PersonPaymentHistoryItem,
  PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";

export function statusLabel(status: PersonPurchaseStatus): string {
  switch (status) {
    case "past_due":
      return "Payment issue";
    case "unpaid":
      return "Payment overdue";
    case "trialing":
      return "Trialing";
    case "canceled":
      return "Canceled";
    case "ended":
      return "Ended";
    case "paused":
      return "Paused";
    case "active":
      return "Active";
    default:
      return "Status unavailable";
  }
}

export function statusClass(status: PersonPurchaseStatus): string {
  switch (status) {
    case "active":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "trialing":
      return "bg-[#DBEAFE] text-[#1D4ED8]";
    case "past_due":
    case "unpaid":
      return "bg-[#FEF3C7] text-[#B45309]";
    case "canceled":
    case "ended":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    default:
      return "bg-[#F0EEF7] text-[#6B6780]";
  }
}

export function formatSubscriptionAmount(
  subscription: PersonSubscriptionPurchase
): string {
  if (subscription.amountCents == null || !subscription.currency) {
    return "Amount unavailable";
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: subscription.currency.toUpperCase(),
    }).format(subscription.amountCents / 100);
  } catch {
    return `${subscription.amountCents / 100} ${subscription.currency.toUpperCase()}`;
  }
}

export function intervalLabel(
  subscription: PersonSubscriptionPurchase
): string {
  if (!subscription.interval) return "recurring";
  const count = subscription.intervalCount ?? 1;
  if (count === 1) return `/${subscription.interval}`;
  return `every ${count} ${subscription.interval}s`;
}

export function formatDate(value: Date | null): string | null {
  return value
    ? value.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
}

/** "Next charge: {date}" / "Ends {date}" — the approved mockup's exact
 *  wording for the Current Subscriptions card, built from the same real
 *  `currentPeriodEnd` field the prior wording ("Renews {date}") already
 *  used; no new data. */
export function nextChargeText(
  subscription: PersonSubscriptionPurchase
): string | null {
  const periodEnd = formatDate(subscription.currentPeriodEnd);
  if (!periodEnd) return null;
  if (subscription.cancelAtPeriodEnd) return `Ends ${periodEnd}`;
  if (subscription.status === "active" || subscription.status === "trialing") {
    return `Next charge: ${periodEnd}`;
  }
  if (subscription.status === "canceled" || subscription.status === "ended") {
    return `Ended ${periodEnd}`;
  }
  return `Current period ends ${periodEnd}`;
}

export function paymentStatusLabel(
  status: PersonPaymentHistoryItem["status"]
): string {
  switch (status) {
    case "succeeded":
      return "Paid";
    case "failed":
      return "Payment failed";
    case "pending":
      return "Pending";
    case "requires_action":
      return "Action required";
    case "refunded":
      return "Refunded";
    case "partially_refunded":
      return "Partially refunded";
    case "canceled":
      return "Canceled";
    default:
      return "Status unavailable";
  }
}

export function paymentStatusClass(
  status: PersonPaymentHistoryItem["status"]
): string {
  switch (status) {
    case "succeeded":
      return "bg-[#DCFCE7] text-[#15803D]";
    case "failed":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    case "pending":
    case "requires_action":
      return "bg-[#FEF3C7] text-[#B45309]";
    case "refunded":
    case "partially_refunded":
      return "bg-[#EDE9FE] text-[#6D28D9]";
    case "canceled":
      return "bg-[#FEE2E2] text-[#B91C1C]";
    default:
      return "bg-[#F0EEF7] text-[#6B6780]";
  }
}

export function paymentTypeLabel(
  type: PersonPaymentHistoryItem["paymentType"]
): string {
  switch (type) {
    case "subscription":
      return "Subscription payment";
    case "one_time":
      return "One-time payment";
    case "invoice":
      return "Invoice payment";
    default:
      return "Payment";
  }
}

export function formatHistoryAmount(
  amountCents: number | null,
  currency: string | null
): string {
  if (amountCents == null || !currency) return "Amount unavailable";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `${amountCents / 100} ${currency.toUpperCase()}`;
  }
}

export function paymentDateLabel(payment: PersonPaymentHistoryItem): string {
  const date = formatDate(
    payment.status === "refunded" || payment.status === "partially_refunded"
      ? (payment.refundedAt ?? payment.occurredAt)
      : payment.status === "failed"
        ? (payment.failedAt ?? payment.occurredAt)
        : (payment.paidAt ?? payment.occurredAt)
  );
  return date ?? "Date unavailable";
}
