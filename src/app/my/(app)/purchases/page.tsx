import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listSubscriptionsForPerson,
  listPaymentHistoryForPerson,
  type PersonPaymentHistoryItem,
  type PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { PurchasesView } from "@/components/mymagnetix/purchases-view";

export const dynamic = "force-dynamic";

/**
 * Data-fetching shell only (2026-09-16 mockup refinement) — every actual
 * render decision lives in the pure, prop-driven `PurchasesView` (see that
 * file's own doc comment for why it was split out: so the exact same
 * component can be exercised with fixture data for populated-state visual
 * QA, since production has no real linked billing data for the current
 * owner QA account yet). This file's only job is auth + the two existing
 * Person-safe reads, unchanged from before this task.
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

  return (
    <PurchasesView
      subscriptions={subscriptions}
      paymentHistory={paymentHistory}
      subscriptionError={subscriptionError}
      paymentHistoryError={paymentHistoryError}
    />
  );
}
