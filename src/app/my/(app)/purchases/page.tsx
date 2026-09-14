import { redirect } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  ExternalLink,
  ReceiptText,
} from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listSubscriptionsForPerson,
  listPaymentHistoryForPerson,
  type PersonPurchaseStatus,
  type PersonPaymentHistoryItem,
  type PersonSubscriptionPurchase,
} from "@/lib/server/mymagnetix-service";
import { ManageSubscriptionButton } from "@/components/mymagnetix/manage-subscription-button";

export const dynamic = "force-dynamic";

function statusLabel(status: PersonPurchaseStatus): string {
  switch (status) {
    case "past_due":
      return "Payment issue";
    case "unpaid":
      return "Payment overdue";
    case "trialing":
      return "Trial";
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

function statusClass(status: PersonPurchaseStatus): string {
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

function formatAmount(subscription: PersonSubscriptionPurchase): string {
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

function intervalLabel(subscription: PersonSubscriptionPurchase): string {
  if (!subscription.interval) return "recurring";
  const count = subscription.intervalCount ?? 1;
  if (count === 1) return `/${subscription.interval}`;
  return `every ${count} ${subscription.interval}s`;
}

function formatDate(value: Date | null): string | null {
  return value
    ? value.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
}

function paymentStatusLabel(
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

function paymentStatusClass(
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

function paymentTypeLabel(
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

function formatHistoryAmount(
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

function paymentDateLabel(payment: PersonPaymentHistoryItem): string {
  const date = formatDate(
    payment.status === "refunded" || payment.status === "partially_refunded"
      ? (payment.refundedAt ?? payment.occurredAt)
      : payment.status === "failed"
        ? (payment.failedAt ?? payment.occurredAt)
        : (payment.paidAt ?? payment.occurredAt)
  );
  if (!date) return "Date unavailable";
  if (
    payment.status === "refunded" ||
    payment.status === "partially_refunded"
  ) {
    return `Refunded ${date}`;
  }
  if (payment.status === "failed") return `Payment failed ${date}`;
  if (payment.status === "succeeded") return `Paid ${date}`;
  return date;
}

function PaymentHistoryCard({
  payment,
}: {
  payment: PersonPaymentHistoryItem;
}) {
  const title = payment.productName || payment.description || "Payment";
  const original = formatHistoryAmount(payment.amountCents, payment.currency);
  const refunded = formatHistoryAmount(
    payment.amountRefundedCents,
    payment.currency
  );
  const net = formatHistoryAmount(payment.netAmountCents, payment.currency);
  const invoiceUrl = payment.invoiceHostedUrl || payment.invoicePdfUrl;
  const invoiceLabel = payment.invoiceHostedUrl
    ? "View invoice"
    : "Download invoice";

  return (
    <article className="rounded-2xl border border-[#ECE9F5] bg-white p-4 shadow-[0_1px_2px_rgba(30,20,60,0.04)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-bold text-[#1D1B27]">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-[11.5px] text-[#8A87A0]">
            {payment.businessName}
          </p>
          <p className="mt-0.5 text-[11px] text-[#8A87A0]">
            {paymentTypeLabel(payment.paymentType)}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${paymentStatusClass(payment.status)}`}
        >
          {paymentStatusLabel(payment.status)}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[17px] font-bold text-[#1D1B27]">{original}</span>
        <span className="text-[11.5px] text-[#6B6780]">
          {paymentDateLabel(payment)}
        </span>
      </div>
      {(payment.status === "refunded" ||
        payment.status === "partially_refunded") &&
        payment.amountRefundedCents != null &&
        payment.netAmountCents != null && (
          <div className="mt-3 grid grid-cols-1 gap-1 border-t border-[#F1EFF7] pt-3 text-[11.5px] text-[#6B6780] sm:grid-cols-3 sm:gap-3">
            <span>Original: {original}</span>
            <span>Refunded: {refunded}</span>
            <span>Net: {net}</span>
          </div>
        )}
      {payment.status === "failed" && payment.failureMessage && (
        <p className="mt-3 rounded-lg bg-[#FFF7F7] px-3 py-2 text-[11.5px] text-[#8B3A3A]">
          {payment.failureMessage}
        </p>
      )}
      {(payment.receiptUrl || invoiceUrl) && (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-[#F1EFF7] pt-3 text-[11.5px] font-semibold text-[#5E2574]">
          {payment.receiptUrl ? (
            <a
              href={payment.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              Receipt <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
          {invoiceUrl ? (
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
            >
              {invoiceLabel} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      )}
    </article>
  );
}

function timingText(subscription: PersonSubscriptionPurchase): string | null {
  const periodEnd = formatDate(subscription.currentPeriodEnd);
  if (!periodEnd) return null;
  if (subscription.cancelAtPeriodEnd) return `Ends ${periodEnd}`;
  if (subscription.status === "active" || subscription.status === "trialing") {
    return `Renews ${periodEnd}`;
  }
  if (subscription.status === "canceled" || subscription.status === "ended") {
    return `Ended ${periodEnd}`;
  }
  return `Current period ends ${periodEnd}`;
}

function SubscriptionCard({
  subscription,
}: {
  subscription: PersonSubscriptionPurchase;
}) {
  const timing = timingText(subscription);
  return (
    <article className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3E4F0] text-[#5E2574]">
            <CreditCard className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-bold text-[#1D1B27]">
              {subscription.productName ||
                subscription.priceName ||
                "Subscription"}
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-[#8A87A0]">
              {subscription.businessName}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${statusClass(subscription.status)}`}
        >
          {statusLabel(subscription.status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[18px] font-bold text-[#1D1B27]">
          {formatAmount(subscription)}
        </span>
        <span className="text-[12px] text-[#8A87A0]">
          {intervalLabel(subscription)}
        </span>
      </div>
      {timing && (
        <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[#6B6780]">
          <CalendarClock className="h-3.5 w-3.5" />
          {timing}
        </p>
      )}
      {subscription.canManage && (
        <div className="mt-4 border-t border-[#F1EFF7] pt-3">
          <ManageSubscriptionButton subscriptionId={subscription.id} />
        </div>
      )}
    </article>
  );
}

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
  const current = subscriptions.filter(
    (subscription) =>
      subscription.status !== "canceled" && subscription.status !== "ended"
  );
  const past = subscriptions.filter(
    (subscription) =>
      subscription.status === "canceled" || subscription.status === "ended"
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <h1 className="text-[20px] font-bold text-[#1D1B27]">Purchases</h1>
        <p className="mt-1 text-[13px] text-[#84809A]">
          View your active subscriptions and purchases across your Magnetix
          businesses.
        </p>
      </div>

      {subscriptionError ? (
        <div className="mt-6 rounded-2xl border border-[#F3D2D2] bg-white p-10 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-[#B91C1C]" />
          <h2 className="mt-3 text-[14px] font-bold text-[#1D1B27]">
            Purchases are temporarily unavailable
          </h2>
          <p className="mt-1 text-[13px] text-[#8A87A0]">
            Please try again in a moment.
          </p>
        </div>
      ) : subscriptions.length === 0 &&
        !paymentHistoryError &&
        paymentHistory.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-[#DCD8EA] bg-white p-10 text-center">
          <ReceiptText className="mx-auto h-8 w-8 text-[#A7A3BA]" />
          <h2 className="mt-3 text-[14px] font-bold text-[#1D1B27]">
            No purchases yet
          </h2>
          <p className="mt-1 text-[13px] text-[#8A87A0]">
            Your purchases and subscriptions will appear here.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-7">
          {current.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold tracking-[0.14em] text-[#8A87A0] uppercase">
                Active subscriptions
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {current.map((subscription) => (
                  <SubscriptionCard
                    key={subscription.id}
                    subscription={subscription}
                  />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold tracking-[0.14em] text-[#8A87A0] uppercase">
                Past subscriptions
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {past.map((subscription) => (
                  <SubscriptionCard
                    key={subscription.id}
                    subscription={subscription}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <section className="mt-7">
        <h2 className="text-[11px] font-bold tracking-[0.14em] text-[#8A87A0] uppercase">
          Payment history
        </h2>
        {paymentHistoryError ? (
          <div className="mt-3 rounded-2xl border border-[#F3D2D2] bg-white p-6 text-center">
            <p className="text-[13px] font-semibold text-[#1D1B27]">
              Payment history is temporarily unavailable
            </p>
            <p className="mt-1 text-[12px] text-[#8A87A0]">
              Please try again in a moment.
            </p>
          </div>
        ) : paymentHistory.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[#DCD8EA] bg-white p-6 text-center">
            <p className="text-[13px] font-semibold text-[#1D1B27]">
              No payment history yet.
            </p>
            <p className="mt-1 text-[12px] text-[#8A87A0]">
              Payment history will appear here as billing records become
              available.
            </p>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {paymentHistory.map((payment) => (
              <PaymentHistoryCard key={payment.id} payment={payment} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
