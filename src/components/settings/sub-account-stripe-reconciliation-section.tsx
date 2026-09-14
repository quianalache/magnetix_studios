"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ContactPicker } from "@/components/quotes/contact-picker";
import type { Contact } from "@/types/contacts";
import type {
  DiscoveredStripeCustomer,
  DiscoveredStripeSubscription,
  StripeContactMatch,
} from "@/types/stripe-discovery";

type CustomerRow = DiscoveredStripeCustomer & { crmMatch: StripeContactMatch };

type ImportedSubscription = {
  externalSubscriptionRecordId?: string;
  externalSubscriptionId: string;
  externalCustomerId: string;
  contactId: string;
};

function statusLabel(status: string): string {
  return status === "past_due"
    ? "Past due"
    : status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: string): string {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "trialing":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "past_due":
    case "unpaid":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "canceled":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return "Amount unavailable";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${amount / 100} ${currency.toUpperCase()}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function matchLabel(match: StripeContactMatch): string {
  if (match.status === "matched") return "Matched";
  if (match.status === "needs_review") return "Needs review";
  return "Unmatched";
}

export function SubAccountStripeReconciliationSection({
  contacts,
}: {
  contacts: Contact[];
}) {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const connected = !!subAccount?.stripeConnect?.accountId;
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(
    null
  );
  const [subscriptions, setSubscriptions] = useState<
    Record<string, DiscoveredStripeSubscription[]>
  >({});
  const [loadingSubscriptions, setLoadingSubscriptions] = useState<
    string | null
  >(null);
  const [imported, setImported] = useState<
    Record<string, ImportedSubscription>
  >({});
  const [importTarget, setImportTarget] = useState<{
    customer: CustomerRow;
    subscription: DiscoveredStripeSubscription;
  } | null>(null);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [importing, setImporting] = useState(false);
  const [backfillTarget, setBackfillTarget] = useState<{
    imported: ImportedSubscription;
    subscription: DiscoveredStripeSubscription;
  } | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts]
  );

  useEffect(() => {
    if (!isAdmin || !connected) return;
    let cancelled = false;
    async function loadImported() {
      try {
        const response = await fetch(
          `/api/sub-accounts/${subAccountId}/billing/imported-subscriptions`
        );
        const data = (await response.json().catch(() => ({}))) as {
          subscriptions?: ImportedSubscription[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            data.error ?? "Could not load imported subscriptions."
          );
        }
        if (!cancelled) {
          setImported(
            Object.fromEntries(
              (data.subscriptions ?? []).map((record) => [
                record.externalSubscriptionId,
                record,
              ])
            )
          );
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not load imported subscriptions."
          );
        }
      }
    }
    void loadImported();
    return () => {
      cancelled = true;
    };
  }, [connected, isAdmin, subAccountId]);

  useEffect(() => {
    if (!isAdmin || !connected) return;
    const timer = window.setTimeout(() => {
      void loadCustomers(false);
    }, 250);
    return () => window.clearTimeout(timer);
    // Search changes intentionally reset the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, isAdmin, query, subAccountId]);

  async function loadCustomers(loadMore: boolean) {
    setLoadingCustomers(true);
    setCustomerError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (query.trim()) params.set("email", query.trim());
      if (loadMore && nextCursor) params.set("startingAfter", nextCursor);
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/billing/external-customers?${params.toString()}`
      );
      const data = (await response.json().catch(() => ({}))) as {
        items?: CustomerRow[];
        hasMore?: boolean;
        nextCursor?: string | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load Stripe customers.");
      }
      setCustomers((current) =>
        loadMore ? [...current, ...(data.items ?? [])] : (data.items ?? [])
      );
      setHasMore(data.hasMore === true);
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      setCustomerError(
        error instanceof Error
          ? error.message
          : "Could not load Stripe customers."
      );
    } finally {
      setLoadingCustomers(false);
    }
  }

  async function toggleCustomer(customer: CustomerRow) {
    if (expandedCustomerId === customer.externalCustomerId) {
      setExpandedCustomerId(null);
      return;
    }
    setExpandedCustomerId(customer.externalCustomerId);
    if (subscriptions[customer.externalCustomerId]) return;
    setLoadingSubscriptions(customer.externalCustomerId);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/billing/external-subscriptions?customerId=${encodeURIComponent(customer.externalCustomerId)}`
      );
      const data = (await response.json().catch(() => ({}))) as {
        items?: DiscoveredStripeSubscription[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load subscriptions.");
      }
      setSubscriptions((current) => ({
        ...current,
        [customer.externalCustomerId]: data.items ?? [],
      }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load subscriptions."
      );
    } finally {
      setLoadingSubscriptions(null);
    }
  }

  function beginImport(
    customer: CustomerRow,
    subscription: DiscoveredStripeSubscription
  ) {
    setSelectedContactId(
      customer.crmMatch.status === "matched"
        ? (customer.crmMatch.candidateContactIds[0] ?? "")
        : ""
    );
    setImportTarget({ customer, subscription });
  }

  async function confirmImport() {
    if (!importTarget || !selectedContactId) return;
    setImporting(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/billing/import-subscription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            externalCustomerId: importTarget.customer.externalCustomerId,
            externalSubscriptionId:
              importTarget.subscription.externalSubscriptionId,
            contactId: selectedContactId,
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        externalSubscription?: { id?: string };
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not link the subscription.");
      }
      setImported((current) => ({
        ...current,
        [importTarget.subscription.externalSubscriptionId]: {
          externalSubscriptionRecordId: data.externalSubscription?.id,
          externalSubscriptionId:
            importTarget.subscription.externalSubscriptionId,
          externalCustomerId: importTarget.customer.externalCustomerId,
          contactId: selectedContactId,
        },
      }));
      setImportTarget(null);
      toast.success("Subscription linked successfully.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not link the subscription."
      );
    } finally {
      setImporting(false);
    }
  }

  async function confirmBackfill() {
    const recordId = backfillTarget?.imported.externalSubscriptionRecordId;
    if (!backfillTarget || !recordId) return;
    setBackfilling(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/billing/external-subscriptions/${encodeURIComponent(recordId)}/backfill-payments`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        examined?: number;
        created?: number;
        updated?: number;
        skipped?: number;
        errors?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not import payment history.");
      }
      toast.success(
        `Payment history synced: ${data.created ?? 0} added, ${data.updated ?? 0} updated, ${data.skipped ?? 0} skipped.`
      );
      if ((data.errors ?? 0) > 0) {
        toast.warning(
          `${data.errors} historical record${data.errors === 1 ? " was" : "s were"} skipped due to an error.`
        );
      }
      setBackfillTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not import payment history."
      );
    } finally {
      setBackfilling(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <section className="bg-card rounded-2xl border p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CreditCard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">
            Import Existing Stripe Subscriptions
          </h2>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Connect existing Stripe customers and subscriptions to CRM contacts
            without asking customers to resubscribe.
          </p>
        </div>
      </header>

      {!connected ? (
        <div className="rounded-lg border border-dashed p-5">
          <p className="text-sm font-medium">Stripe is not connected</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Connect this workspace&apos;s Stripe account to review existing
            customers and subscriptions.
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => {
              window.location.href = `/api/sub-accounts/${subAccountId}/stripe-connect/connect`;
            }}
          >
            Connect with Stripe
          </Button>
        </div>
      ) : (
        <>
          <div className="relative mb-4 max-w-md">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Stripe customers by email…"
              className="pl-8"
            />
          </div>

          {customerError && (
            <p className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-lg border p-3 text-sm">
              {customerError}
            </p>
          )}
          {loadingCustomers && customers.length === 0 ? (
            <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-8 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Stripe customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              {query.trim()
                ? "No Stripe customers match that email."
                : "No Stripe customers found."}
            </div>
          ) : (
            <div className="space-y-2">
              {customers.map((customer) => {
                const linked = Object.values(imported).filter(
                  (record) =>
                    record.externalCustomerId === customer.externalCustomerId
                );
                const isExpanded =
                  expandedCustomerId === customer.externalCustomerId;
                return (
                  <div
                    key={customer.externalCustomerId}
                    className="bg-background rounded-xl border"
                  >
                    <button
                      type="button"
                      className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
                      onClick={() => void toggleCustomer(customer)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {customer.name || "Unnamed Stripe customer"}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {customer.email || "No email"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          customer.crmMatch.status === "matched"
                            ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                            : customer.crmMatch.status === "needs_review"
                              ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
                              : "border-border text-muted-foreground"
                        }
                      >
                        {matchLabel(customer.crmMatch)}
                      </Badge>
                      {linked.length > 0 && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {linked.length} linked
                        </Badge>
                      )}
                      <ChevronDown
                        className={`text-muted-foreground h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                    {isExpanded && (
                      <SubscriptionList
                        customer={customer}
                        subscriptions={
                          subscriptions[customer.externalCustomerId] ?? []
                        }
                        loading={
                          loadingSubscriptions === customer.externalCustomerId
                        }
                        imported={imported}
                        contacts={contactById}
                        onImport={beginImport}
                        onBackfill={(
                          importedSubscription,
                          discoveredSubscription
                        ) =>
                          setBackfillTarget({
                            imported: importedSubscription,
                            subscription: discoveredSubscription,
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadCustomers(true)}
                disabled={loadingCustomers}
              >
                {loadingCustomers && (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                )}
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!importTarget}
        onOpenChange={(open) => {
          if (!open && !importing) setImportTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link existing Stripe subscription</DialogTitle>
            <DialogDescription>
              This links the existing subscription to a CRM contact. It does not
              create a subscription, charge the customer, or change course or
              community access.
            </DialogDescription>
          </DialogHeader>
          {importTarget && (
            <div className="space-y-4">
              <div className="bg-muted/20 rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {importTarget.customer.name ||
                    importTarget.customer.email ||
                    "Stripe customer"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {importTarget.customer.email || "No email"}
                </p>
                <div className="text-muted-foreground mt-2 flex flex-wrap gap-2 text-xs">
                  <span>
                    {importTarget.subscription.items[0]?.productName ||
                      "Subscription"}
                  </span>
                  <span>·</span>
                  <span>
                    {formatMoney(
                      importTarget.subscription.items[0]?.unitAmount ?? null,
                      importTarget.subscription.items[0]?.currency ?? null
                    )}
                  </span>
                  <span>·</span>
                  <span>
                    {importTarget.subscription.items[0]?.recurringInterval ??
                      "recurring"}
                  </span>
                  <span>·</span>
                  <span>{statusLabel(importTarget.subscription.status)}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">CRM contact</p>
                <ContactPicker
                  contacts={
                    importTarget.customer.crmMatch.status === "needs_review"
                      ? contacts.filter((contact) =>
                          importTarget.customer.crmMatch.candidateContactIds.includes(
                            contact.id
                          )
                        )
                      : contacts
                  }
                  value={selectedContactId}
                  onChange={setSelectedContactId}
                  placeholder="Choose an existing contact…"
                  title={
                    importTarget.customer.crmMatch.status === "needs_review"
                      ? "Choose the correct matching contact"
                      : "Choose a CRM contact"
                  }
                />
                {importTarget.customer.crmMatch.status === "needs_review" && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Multiple CRM contacts share this email. Choose carefully;
                    Magnetix will not guess.
                  </p>
                )}
                {importTarget.customer.crmMatch.status === "unmatched" && (
                  <p className="text-muted-foreground text-xs">
                    No matching CRM contact was found. Choose an existing
                    contact; this flow will not create one.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportTarget(null)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmImport()}
              disabled={!selectedContactId || importing}
            >
              {importing && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              Confirm link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!backfillTarget}
        onOpenChange={(open) => {
          if (!open && !backfilling) setBackfillTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Stripe payment history</DialogTitle>
            <DialogDescription>
              This reads up to 24 months of historical invoices for this linked
              Stripe subscription. It does not charge, modify, or contact the
              customer, and does not change access.
            </DialogDescription>
          </DialogHeader>
          {backfillTarget && (
            <div className="bg-muted/20 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                {backfillTarget.subscription.items[0]?.productName ||
                  backfillTarget.subscription.items[0]?.priceName ||
                  "Stripe subscription"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Historical records are added to the billing ledger only.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBackfillTarget(null)}
              disabled={backfilling}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmBackfill()}
              disabled={
                !backfillTarget?.imported.externalSubscriptionRecordId ||
                backfilling
              }
            >
              {backfilling && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              Import payment history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SubscriptionList({
  customer,
  subscriptions,
  loading,
  imported,
  contacts,
  onImport,
  onBackfill,
}: {
  customer: CustomerRow;
  subscriptions: DiscoveredStripeSubscription[];
  loading: boolean;
  imported: Record<string, ImportedSubscription>;
  contacts: Map<string, Contact>;
  onImport: (
    customer: CustomerRow,
    subscription: DiscoveredStripeSubscription
  ) => void;
  onBackfill: (
    imported: ImportedSubscription,
    subscription: DiscoveredStripeSubscription
  ) => void;
}) {
  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 border-t p-4 text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading subscriptions…
      </div>
    );
  }
  if (subscriptions.length === 0) {
    return (
      <div className="text-muted-foreground border-t p-4 text-xs">
        No subscriptions found for this customer.
      </div>
    );
  }
  return (
    <div className="space-y-2 border-t p-3">
      {subscriptions.map((subscription) => {
        const item = subscription.items[0];
        const linked = imported[subscription.externalSubscriptionId];
        const linkedContact = linked ? contacts.get(linked.contactId) : null;
        return (
          <div
            key={subscription.externalSubscriptionId}
            className="rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {item?.productName ||
                    item?.priceName ||
                    "Stripe subscription"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {item
                    ? `${formatMoney(item.unitAmount, item.currency)} · ${item.recurringInterval ?? "recurring"}${item.recurringIntervalCount && item.recurringIntervalCount > 1 ? ` × ${item.recurringIntervalCount}` : ""}`
                    : "Plan details unavailable"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Next renewal: {formatDate(subscription.currentPeriodEnd)}
                  {subscription.cancelAtPeriodEnd
                    ? " · Cancels at period end"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={statusClass(subscription.status)}
                >
                  {statusLabel(subscription.status)}
                </Badge>
                {linked ? (
                  <>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Linked
                      {linkedContact
                        ? ` · ${linkedContact.name || linkedContact.email}`
                        : ""}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!linked.externalSubscriptionRecordId}
                      onClick={() => onBackfill(linked, subscription)}
                    >
                      Import payment history
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onImport(customer, subscription)}
                  >
                    Import
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
