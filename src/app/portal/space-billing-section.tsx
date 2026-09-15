"use client";

import { useState } from "react";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { formatCurrency } from "@/lib/format";
import type {
  PersonPaymentHistoryItem,
  PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { SubscriptionCard } from "@/components/mymagnetix/subscription-card";
import { SubscriptionDetailsSheet } from "@/components/mymagnetix/subscription-details-sheet";
import { PaymentHistoryTable } from "@/components/mymagnetix/payment-history-table";
import type { Quote } from "@/types/quotes";

/**
 * Space Billing (2026-09-16 owner QA fix) — the tenant-scoped sibling of
 * MyMagnetix Purchases, reusing its exact UI primitives
 * (SubscriptionCard/PaymentHistoryTable/SubscriptionDetailsSheet) rather
 * than a second billing UI, per this task's own "reuse where appropriate"
 * instruction. Simpler than MyMagnetix Purchases because it's already
 * scoped to one business: no per-card business name (redundant here), no
 * cross-business aggregation of any kind — `subscriptions`/
 * `paymentHistory` arrive pre-scoped to (this Person, this sub-account)
 * by the Server Component caller (portal-home-view.tsx), which is also
 * the ONLY place any Firestore read happens; this component is pure
 * presentation + the interactive "View details" state that requires a
 * Client Component boundary.
 *
 * Manage Subscription posts to THIS Space's own Member-authenticated
 * endpoint (/api/portal/{saId}/billing/portal) — never MyMagnetix's,
 * which would 401 a Portal-only visitor with no mm_session.
 */
export function SpaceBillingSection({
  saId,
  subscriptions,
  paymentHistory,
  quotes,
}: {
  saId: string;
  subscriptions: PersonSubscriptionPurchase[];
  paymentHistory: PersonPaymentHistoryItem[];
  quotes: Quote[];
}) {
  const [selectedSubscription, setSelectedSubscription] =
    useState<PersonSubscriptionPurchase | null>(null);

  const currentSubscriptions = subscriptions.filter(
    (s) => s.status !== "canceled" && s.status !== "ended"
  );
  const manageEndpoint = `/api/portal/${saId}/billing/portal`;

  return (
    <>
      <div className="space-y-7">
        <section>
          <h2 className="text-[11px] font-bold tracking-[0.1em] text-[#8A87A0] uppercase">
            Current subscription
          </h2>
          {currentSubscriptions.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#4F5565]">
              No active subscription.
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {currentSubscriptions.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  subscription={subscription}
                  onViewDetails={() => setSelectedSubscription(subscription)}
                  manageEndpoint={manageEndpoint}
                  showBusinessName={false}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[11px] font-bold tracking-[0.1em] text-[#8A87A0] uppercase">
            Payment history
          </h2>
          {paymentHistory.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#4F5565]">
              No payment history yet.
            </p>
          ) : (
            <div className="mt-3">
              <PaymentHistoryTable payments={paymentHistory} />
            </div>
          )}
        </section>

        <section>
          <h2 className="text-[11px] font-bold tracking-[0.1em] text-[#8A87A0] uppercase">
            Quotes &amp; invoices
          </h2>
          {quotes.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#4F5565]">
              No quotes or invoices yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {quotes.map((quote) => {
                const total = computeQuoteTotals(quote).total;
                const isInvoice = quote.kind === "invoice";
                return (
                  <a
                    key={quote.id}
                    href={`/api/portal/${saId}/quotes/${quote.id}/view`}
                    className="flex items-center justify-between gap-4 rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_34px_rgba(18,18,18,0.035)] hover:border-[var(--portal-accent)]"
                  >
                    <div>
                      <p className="text-[16px] font-bold text-[#111217]">
                        {isInvoice ? "Invoice" : "Quote"} {quote.quoteNumber}
                      </p>
                      <p className="mt-1 text-[13px] text-[#4F5565] capitalize">
                        {quote.status}
                      </p>
                    </div>
                    <p className="shrink-0 text-[16px] font-bold text-[#111217]">
                      {formatCurrency(total, quote.currency)}
                    </p>
                  </a>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <SubscriptionDetailsSheet
        subscription={selectedSubscription}
        onClose={() => setSelectedSubscription(null)}
        manageEndpoint={manageEndpoint}
      />
    </>
  );
}
