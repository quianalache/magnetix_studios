import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listSubscriptionsForPerson,
  listPaymentHistoryForPerson,
  type PersonPaymentHistoryItem,
  type PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { listAgencyPurchasesForPerson } from "@/lib/server/agency-mymagnetix-billing-service";
import { PurchasesView } from "@/components/mymagnetix/purchases-view";

export const dynamic = "force-dynamic";

/**
 * Data-fetching shell only (2026-09-16 mockup refinement) — every actual
 * render decision lives in the pure, prop-driven `PurchasesView` (see that
 * file's own doc comment for why it was split out: so the exact same
 * component can be exercised with fixture data for populated-state visual
 * QA, since production has no real linked billing data for the current
 * owner QA account yet). This file's only job is auth + the Person-safe
 * reads: the two tenant-Contact-ledger-backed ones, unchanged, PLUS a
 * third Agency-scope read (2026-09-18) merged into the same two lists —
 * see agency-mymagnetix-billing-service.ts for why that's a parallel read
 * rather than a write into the tenant ledger.
 */
export default async function MyMagnetixPurchasesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);
  let subscriptions: PersonSubscriptionPurchase[] = [];
  let subscriptionError = false;
  try {
    subscriptions = await listSubscriptionsForPerson(person.id, memberships);
  } catch {
    subscriptionError = true;
  }
  let paymentHistory: PersonPaymentHistoryItem[] = [];
  let paymentHistoryError = false;
  try {
    paymentHistory = await listPaymentHistoryForPerson(person.id, memberships);
  } catch {
    paymentHistoryError = true;
  }

  try {
    const agency = await listAgencyPurchasesForPerson(person.id);
    subscriptions = [...subscriptions, ...agency.subscriptions].sort((a, b) => {
      const aTime = a.currentPeriodEnd?.getTime() ?? -Infinity;
      const bTime = b.currentPeriodEnd?.getTime() ?? -Infinity;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    });
    paymentHistory = [...paymentHistory, ...agency.paymentHistory].sort((a, b) => {
      const aTime = a.occurredAt?.getTime() ?? -Infinity;
      const bTime = b.occurredAt?.getTime() ?? -Infinity;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id);
    });
  } catch {
    // Best-effort merge — a failure here shouldn't blank out the tenant
    // ledger the two reads above already successfully fetched.
  }

  return (
    <PurchasesView
      subscriptions={subscriptions}
      paymentHistory={paymentHistory}
      subscriptionError={subscriptionError}
      paymentHistoryError={paymentHistoryError}
    />
  );
}
