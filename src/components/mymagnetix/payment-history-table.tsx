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
      <div className="overflow-x-auto rounded-2xl border border-[#ECE9F5] bg-white">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#ECE9F5] text-[11px] font-bold tracking-[0.06em] text-[#8A87A0] uppercase">
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Business</th>
              <th className="px-4 py-3 font-bold">Purchase</th>
              <th className="px-4 py-3 text-right font-bold">Amount</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F1FA]">
            {pageItems.map((payment) => {
              const receiptUrl =
                payment.receiptUrl ||
                payment.invoiceHostedUrl ||
                payment.invoicePdfUrl;
              return (
                <tr key={payment.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-[#6B6780]">
                    {paymentDateLabel(payment)}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-[#1D1B27]">
                    {payment.businessName}
                  </td>
                  <td className="px-4 py-3 text-[#1D1B27]">
                    <div className="flex items-center gap-2">
                      <span className="max-w-[220px] truncate">
                        {payment.productName ||
                          payment.description ||
                          "Payment"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelected(payment)}
                        className="shrink-0 text-[11.5px] font-semibold text-[#5E2574] hover:underline"
                      >
                        View
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap text-[#1D1B27]">
                    {formatHistoryAmount(payment.amountCents, payment.currency)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${paymentStatusClass(payment.status)}`}
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
                        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#5E2574] hover:underline"
                      >
                        <Download className="h-3 w-3" />
                        Download receipt
                      </a>
                    ) : (
                      <span className="text-[11.5px] text-[#C7C4D6]">—</span>
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
          <p className="text-[12px] text-[#8A87A0]">
            Showing {rangeStart}–{rangeEnd} of {payments.length}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#E4E4E4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#5B5B62] disabled:cursor-not-allowed disabled:opacity-50"
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
                    ? "rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
                    : "rounded-lg border border-[#E4E4E4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#5B5B62] hover:bg-[#F3E4F0]"
                }
                style={
                  num === currentPage ? { background: "#5E2574" } : undefined
                }
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[#E4E4E4] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#5B5B62] disabled:cursor-not-allowed disabled:opacity-50"
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
