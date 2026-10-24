"use client";

import { ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { PersonPaymentHistoryItem } from "@/lib/server/mymagnetix-service";
import {
  formatHistoryAmount,
  paymentDateLabel,
  paymentStatusLabel,
  paymentStatusClass,
  paymentTypeLabel,
} from "@/lib/mymagnetix/purchases-format";

/**
 * The Payment History table's subtle "View" action (approved Purchases
 * mockup, 2026-09-16) — a drawer showing the fuller set of fields already
 * on the `PersonPaymentHistoryItem` the table already has (refund/net
 * breakdown, failure reason, payment type) that don't fit in one table
 * row. No new fetch, no new service call, nothing invented.
 */
export function PaymentDetailsSheet({
  payment,
  onClose,
}: {
  payment: PersonPaymentHistoryItem | null;
  onClose: () => void;
}) {
  const invoiceUrl = payment?.invoiceHostedUrl || payment?.invoicePdfUrl;
  const invoiceLabel = payment?.invoiceHostedUrl
    ? "View invoice"
    : "Download invoice";
  const showRefundBreakdown =
    payment &&
    (payment.status === "refunded" ||
      payment.status === "partially_refunded") &&
    payment.amountRefundedCents != null &&
    payment.netAmountCents != null;

  return (
    <Sheet open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {payment?.productName || payment?.description || "Payment"}
          </SheetTitle>
          <SheetDescription>{payment?.businessName}</SheetDescription>
        </SheetHeader>
        {payment && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full px-2.5 py-1 text-micro font-semibold ${paymentStatusClass(payment.status)}`}
              >
                {paymentStatusLabel(payment.status)}
              </span>
              <span className="text-section font-semibold text-foreground">
                {formatHistoryAmount(payment.amountCents, payment.currency)}
              </span>
            </div>

            <dl className="space-y-2.5 border-t border-border pt-4 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium text-foreground">
                  {paymentDateLabel(payment)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="font-medium text-foreground">
                  {paymentTypeLabel(payment.paymentType)}
                </dd>
              </div>
              {showRefundBreakdown && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Original amount</dt>
                    <dd className="font-medium text-foreground">
                      {formatHistoryAmount(
                        payment.amountCents,
                        payment.currency
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Refunded</dt>
                    <dd className="font-medium text-foreground">
                      {formatHistoryAmount(
                        payment.amountRefundedCents,
                        payment.currency
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Net</dt>
                    <dd className="font-medium text-foreground">
                      {formatHistoryAmount(
                        payment.netAmountCents,
                        payment.currency
                      )}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {payment.status === "failed" && payment.failureMessage && (
              <p className="rounded-lg bg-status-danger-bg px-3 py-2 text-body-sm text-destructive">
                {payment.failureMessage}
              </p>
            )}

            {(payment.receiptUrl || invoiceUrl) && (
              <div className="flex flex-wrap gap-3 border-t border-border pt-4 text-body-sm font-semibold text-primary">
                {payment.receiptUrl && (
                  <a
                    href={payment.receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    Download receipt <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {invoiceUrl && (
                  <a
                    href={invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline"
                  >
                    {invoiceLabel} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
