"use client";

import { formatCurrency } from "@/lib/format";
import { currencyEntries, type CurrencyTotals } from "@/types/pipeline-board";

/**
 * Money that may span several currencies. Never sums across currencies:
 * the largest total is shown, with "+N" and a tooltip listing the rest.
 */
export function CurrencyTotalsText({
  totals,
  emptyCurrency = "USD",
  className,
}: {
  totals: CurrencyTotals;
  emptyCurrency?: string;
  className?: string;
}) {
  const entries = currencyEntries(totals);
  if (entries.length === 0) {
    return <span className={className}>{formatCurrency(0, emptyCurrency)}</span>;
  }
  const [first, ...rest] = entries;
  const all = entries.map(([c, v]) => formatCurrency(v, c)).join(" · ");
  return (
    <span className={className} title={rest.length > 0 ? all : undefined}>
      {formatCurrency(first[1], first[0])}
      {rest.length > 0 && (
        <span className="ml-1 text-[0.7em] font-medium text-muted-foreground">
          +{rest.length} {rest.length === 1 ? "currency" : "currencies"}
        </span>
      )}
    </span>
  );
}

/** Plain-text form for places that can't render markup (toasts, titles). */
export function formatCurrencyTotals(totals: CurrencyTotals, emptyCurrency = "USD"): string {
  const entries = currencyEntries(totals);
  if (entries.length === 0) return formatCurrency(0, emptyCurrency);
  return entries.map(([c, v]) => formatCurrency(v, c)).join(" · ");
}
