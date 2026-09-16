import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Agency Home → Recent Activity. Reads real, already-recorded operator
 * events — never fabricated. `billingEvents` (append-only, written by
 * billing-service.ts) has never been read back anywhere in this codebase
 * before this, so there's no existing composite index for it. Rather than
 * add one, this follows the exact same "read the small full set, sort in
 * memory" convention `acquisition-service.ts` already documents for
 * `purchases` — a single equality filter (`agencyId ==`) needs no index,
 * and per-agency billingEvents volume is small pre-launch.
 */

const EVENT_DOC_CAP = 300;
const DEFAULT_LIMIT = 8;

export type AgencyActivityKind =
  | "signup"
  | "activated"
  | "plan_assigned"
  | "plan_switched"
  | "comped"
  | "payment_failed"
  | "payment_recovered"
  | "canceled"
  | "reactivated"
  | "status_changed";

export interface AgencyActivityItem {
  id: string;
  kind: AgencyActivityKind;
  label: string;
  subAccountId: string;
  subAccountName: string;
  occurredAt: string | null;
}

interface BillingEventDoc {
  agencyId: string;
  subAccountId: string;
  event:
    | "plan.assigned"
    | "plan.switched"
    | "comped"
    | "activated"
    | "status.changed"
    | "charge.created"
    | "charge.paid"
    | "charge.canceled";
  detail: Record<string, unknown>;
  createdAt: unknown;
}

function tsToMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (v instanceof Date) return v.getTime();
  return 0;
}

function tsToIso(v: unknown): string | null {
  const ms = tsToMillis(v);
  return ms > 0 ? new Date(ms).toISOString() : null;
}

/** Maps one billingEvents doc to a friendly kind + label. Charge events
 *  (one-time agency→client invoices) are intentionally excluded — Recent
 *  Activity is about the SaaS subscription lifecycle, not ad-hoc billing. */
function describeBillingEvent(
  doc: BillingEventDoc,
): { kind: AgencyActivityKind; label: string } | null {
  const detail = doc.detail ?? {};
  switch (doc.event) {
    case "activated":
      return detail.via === "platformSignup"
        ? { kind: "signup", label: "New customer signup" }
        : { kind: "activated", label: "Subscription activated" };
    case "plan.assigned":
      return { kind: "plan_assigned", label: "Plan assigned" };
    case "plan.switched":
      return { kind: "plan_switched", label: "Plan changed" };
    case "comped":
      return { kind: "comped", label: "Account comped" };
    case "status.changed": {
      const status = detail.status as string | undefined;
      const previous = detail.previousStatus as string | undefined;
      if (status === "canceled") {
        return { kind: "canceled", label: "Subscription canceled" };
      }
      if (status === "past_due") {
        return { kind: "payment_failed", label: "Payment failed" };
      }
      if (status === "active" && previous === "past_due") {
        return { kind: "payment_recovered", label: "Payment recovered" };
      }
      if (status === "active" && previous === "canceled") {
        return { kind: "reactivated", label: "Customer reactivated" };
      }
      return {
        kind: "status_changed",
        label: `Billing status changed to ${status ?? "unknown"}`,
      };
    }
    default:
      return null;
  }
}

/**
 * Most recent operator-relevant billing events for an agency, newest first,
 * with each event's sub-account name resolved for display. Does NOT include
 * "sub-account created" — Agency Home merges that in separately from the
 * `subAccounts` snapshot it already holds client-side (real createdAt
 * timestamps, no extra read needed).
 */
export async function getRecentAgencyActivity(
  agencyId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<AgencyActivityItem[]> {
  const db = getAdminDb();
  const snap = await db
    .collection("billingEvents")
    .where("agencyId", "==", agencyId)
    .limit(EVENT_DOC_CAP)
    .get();

  const docs = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as BillingEventDoc }))
    .sort((a, b) => tsToMillis(b.data.createdAt) - tsToMillis(a.data.createdAt));

  const items: AgencyActivityItem[] = [];
  const nameCache = new Map<string, string>();

  for (const { id, data } of docs) {
    if (items.length >= limit) break;
    const described = describeBillingEvent(data);
    if (!described) continue;

    let name = nameCache.get(data.subAccountId);
    if (name === undefined) {
      const subSnap = await db.doc(`subAccounts/${data.subAccountId}`).get();
      name = (subSnap.data()?.name as string) || "Unknown workspace";
      nameCache.set(data.subAccountId, name);
    }

    items.push({
      id,
      kind: described.kind,
      label: described.label,
      subAccountId: data.subAccountId,
      subAccountName: name,
      occurredAt: tsToIso(data.createdAt),
    });
  }

  return items;
}
