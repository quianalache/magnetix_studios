"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { PersonPaymentHistoryItem } from "@/lib/server/mymagnetix-service";
import {
  formatHistoryAmount,
  paymentDateLabel,
  paymentStatusLabel,
  paymentStatusClass,
} from "@/lib/mymagnetix/purchases-format";
import { PaymentDetailsSheet } from "@/components/mymagnetix/payment-details-sheet";

const PAGE_SIZE = 10;

/**
 * Payment History table + pagination (approved Purchases mockup,
 * 2026-09-16). Paginates CLIENT-SIDE over the already-fetched, already-
 * sorted (newest-first) full list `listPaymentHistoryForPerson` returns —
 * no new pagination params on that service, no second fetch, no
 * duplicated ordering logic; this only slices the array the page already
 * has. Real total count throughout ("Showing 1-10 of 24"); the pagination
 * control itself is hidden entirely when everything fits on one page.
 */
export function PaymentHistoryTable({
  payments,
}: {
  payments: PersonPaymentHistoryItem[];
}) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PersonPaymentHistoryItem | null>(
    null
  );

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageItems = payments.slice(startIndex, startIndex + PAGE_SIZE);
  const rangeStart = payments.length === 0 ? 0 : startIndex + 1;
  const rangeEnd = Math.min(startIndex + PAGE_SIZE, payments.length);

  // At most 3 page-number buttons shown at once (matches the approved
  // mockup's "Previous 1 2 3 Next" — this dataset is a person's own
  // billing history, not expected to run to hundreds of pages).
  const pageButtons = useMemo(() => {
    const count = Math.min(3, totalPages);
    const start = Math.min(
      Math.max(1, currentPage - 1),
      Math.max(1, totalPages - count + 1)
    );
    return Array.from({ length: count }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  return (
    <>
      {/* Phones: a stacked list (a 6-column table can't fit 390px). */}
      <ul className="divide-y divide-border rounded-card border border-border bg-card shadow-card sm:hidden">
        {pageItems.map((payment) => {
          const receiptUrl = payment.receiptUrl || payment.invoiceHostedUrl || payment.invoicePdfUrl;
          return (
            <li key={payment.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-body-sm font-semibold text-foreground">{payment.productName || payment.description || "Payment"}</p>
                <p className="shrink-0 text-body-sm font-semibold text-foreground tabular-nums">{formatHistoryAmount(payment.amountCents, payment.currency)}</p>
              </div>
              <p className="text-caption text-muted-foreground">
                {paymentDateLabel(payment)} · {payment.businessName}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`rounded-full px-2.5 py-0.5 text-micro font-semibold ${paymentStatusClass(payment.status)}`}>{paymentStatusLabel(payment.status)}</span>
                <button type="button" onClick={() => setSelected(payment)} className="text-caption font-semibold text-link hover:underline">
                  View details
                </button>
                {receiptUrl && (
                  <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption font-semibold text-link hover:underline">
                    <Download className="size-3" />
                    Receipt
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-card shadow-card sm:block">
        <table className="w-full min-w-[640px] text-left text-body-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-th font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Business</th>
              <th className="px-4 py-3 font-semibold">Purchase</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageItems.map((payment) => {
              const receiptUrl =
                payment.receiptUrl ||
                payment.invoiceHostedUrl ||
                payment.invoicePdfUrl;
              return (
                <tr key={payment.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {paymentDateLabel(payment)}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-foreground">
                    {payment.businessName}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="max-w-[220px] truncate">
                        {payment.productName ||
                          payment.description ||
                          "Payment"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelected(payment)}
                        className="shrink-0 text-caption font-semibold text-link hover:underline"
                      >
                        View
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-foreground">
                    {formatHistoryAmount(payment.amountCents, payment.currency)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-micro font-semibold ${paymentStatusClass(payment.status)}`}
                    >
                      {paymentStatusLabel(payment.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {receiptUrl ? (
                      <a
                        href={receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-caption font-semibold text-link hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        Download receipt
                      </a>
                    ) : (
                      <span className="text-caption text-ink-tertiary">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {payments.length > PAGE_SIZE && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {payments.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-caption font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            {pageButtons.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setPage(num)}
                className={
                  num === currentPage
                    ? "rounded-lg bg-primary px-3 py-1.5 text-caption font-semibold text-primary-foreground"
                    : "rounded-lg border border-border bg-card px-3 py-1.5 text-caption font-semibold text-muted-foreground hover:bg-accent"
                }
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-caption font-semibold text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      <PaymentDetailsSheet
        payment={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
