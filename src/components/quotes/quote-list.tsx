"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";

import { computeQuoteTotals, effectiveQuoteStatus } from "@/lib/quotes/calc";
import { subscribeToQuotes } from "@/lib/firestore/quotes";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Quote, QuoteStatus } from "@/types/quotes";
import type { TenantScope } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/system/empty-state";
import { FilterBar } from "@/components/system/filter-bar";
import { SearchField } from "@/components/system/search-field";
import { Tag } from "@/components/system/status-pill";
import { DATA_TABLE_HEAD_ROW } from "@/components/system/data-table";

/**
 * Sub-account-wide quote list. Subscribes to all quotes in the active
 * sub-account and renders them as rows with status pill + total. Filter
 * chips at the top let the operator narrow by status; a text search
 * matches against quote number + contact name + billed-to-organization.
 *
 * Used by:
 *   - the standalone /sa/[id]/quotes page
 *
 * The contact-profile section card (ContactQuotes) uses
 * subscribeToQuotesForContact() directly with a slimmer layout — different
 * component (this one would be overkill at 3 rows).
 */

type StatusFilter = QuoteStatus | "all";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "paid", label: "Paid" },
];

interface QuoteListProps {
  scope: TenantScope;
  /** Map of contactId → contact display name. Caller fetches contacts
   *  separately (we don't double-subscribe inside this list). */
  contacts: Record<string, { name: string; email: string }>;
}

export function QuoteList({ scope, contacts }: QuoteListProps) {
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!filterReady) return;
    setLoading(true);
    const unsubscribe = subscribeToQuotes(
      scope,
      { territoryFilter },
      (data) => {
        setQuotes(data);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [scope, filterReady, territoryFilter]);

  // Count per status — used to badge the filter chips.
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: quotes.length,
      draft: 0,
      sent: 0,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      paid: 0,
    };
    for (const q of quotes) {
      const eff = effectiveQuoteStatus(q);
      counts[eff] = (counts[eff] ?? 0) + 1;
    }
    return counts;
  }, [quotes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((q) => {
      const eff = effectiveQuoteStatus(q);
      if (filter !== "all" && eff !== filter) return false;
      if (!term) return true;
      const contact = contacts[q.contactId];
      const contactName = (contact?.name ?? "").toLowerCase();
      const contactEmail = (contact?.email ?? "").toLowerCase();
      const billedTo = (q.billedToOrganization ?? "").toLowerCase();
      return (
        q.quoteNumber.toLowerCase().includes(term) ||
        contactName.includes(term) ||
        contactEmail.includes(term) ||
        billedTo.includes(term)
      );
    });
  }, [quotes, filter, search, contacts]);

  if (loading) {
    return <Skeleton className="h-64 w-full rounded-card" aria-label="Loading quotes" />;
  }

  if (quotes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No quotes or invoices yet"
        description={
          <>
            Use &ldquo;New quote&rdquo; to create one. Pick the <strong>Quote</strong> type to send an estimate, or{" "}
            <strong>Invoice</strong> to bill directly.
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter chips + search */}
      <FilterBar
        search={
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search quote number, contact, organization…"
            aria-label="Search quotes and invoices"
          />
        }
        filters={STATUS_CHIPS.map((chip) => {
          const isActive = filter === chip.value;
          const count = statusCounts[chip.value] ?? 0;
          if (chip.value !== "all" && count === 0 && !isActive) return null;
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(chip.value)}
              className={cn(
                "inline-flex h-(--ds-control-sm) items-center gap-1.5 rounded-control border px-3 text-caption font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive
                  ? "border-violet-ds-300 bg-accent text-accent-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {chip.label}
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </button>
          );
        })}
      />

      {filtered.length === 0 ? (
        <EmptyState compact title="No quotes match this filter" />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
          {/* Header — the approved plum index band */}
          <div className={cn(DATA_TABLE_HEAD_ROW, "hidden grid-cols-[1fr_6rem_2fr_1fr_8rem_8rem] gap-3 px-4 py-3 sm:grid")}>
            <div>Number</div>
            <div>Type</div>
            <div>Recipient</div>
            <div>Status</div>
            <div className="text-right">Total</div>
            <div className="text-right">Updated</div>
          </div>
          {/* Rows */}
          <ul className="divide-y divide-border-subtle">
            {filtered.map((q) => {
              const eff = effectiveQuoteStatus(q);
              const totals = computeQuoteTotals(q);
              const contact = contacts[q.contactId];
              const recipient = contact?.name || contact?.email || "(deleted contact)";
              const isInvoice = q.kind === "invoice";
              return (
                <li key={q.id}>
                  <Link
                    href={`/sa/${scope.subAccountId}/quotes/${q.id}`}
                    className="grid grid-cols-2 gap-2 px-4 py-3 text-body-sm transition-colors outline-none hover:bg-tint-violet focus-visible:bg-tint-violet sm:grid-cols-[1fr_6rem_2fr_1fr_8rem_8rem] sm:items-center"
                  >
                    <div className="font-mono text-caption font-semibold text-foreground sm:text-body-sm">{q.quoteNumber}</div>
                    <div>
                      <Tag color={isInvoice ? "green" : "violet"}>{isInvoice ? "Invoice" : "Quote"}</Tag>
                    </div>
                    <div className="truncate text-foreground">
                      <p className="truncate font-medium">{recipient}</p>
                      {contact?.name && contact.email && (
                        <p className="truncate text-caption text-muted-foreground">{contact.email}</p>
                      )}
                      {q.billedToOrganization && (
                        <p className="truncate text-caption text-muted-foreground">{q.billedToOrganization}</p>
                      )}
                    </div>
                    <div>
                      <QuoteStatusBadge status={eff} />
                    </div>
                    <div className="text-right font-medium tabular-nums text-foreground">{formatCurrency(totals.total, q.currency)}</div>
                    <div className="text-right text-caption text-muted-foreground">{formatRelativeTime(q.updatedAt)}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
