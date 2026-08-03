"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, X } from "lucide-react";

interface RecentPurchase {
  firstName: string;
  location: string | null;
  purchasedAt: string;
}

const VISIBLE_MS = 6000;
const GAP_MS = 9000;
const FIRST_DELAY_MS = 3000;

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Opt-in social-proof popup for a Course Offer's public checkout page —
 * cycles through real recent purchases (first name + city/country only,
 * see the recent-purchases route). Renders nothing when the feature is
 * off, there's no purchase history yet, or the visitor dismissed it.
 */
export function RecentPurchasePopup({
  saId,
  offerId,
  productName,
}: {
  saId: string;
  offerId: string;
  productName: string;
}) {
  const [purchases, setPurchases] = useState<RecentPurchase[] | null>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/offer/${saId}/${offerId}/recent-purchases`)
      .then((r) => r.json())
      .then((data: { purchases?: RecentPurchase[] }) => {
        if (!cancelled) setPurchases(data.purchases ?? []);
      })
      .catch(() => {
        if (!cancelled) setPurchases([]);
      });
    return () => {
      cancelled = true;
    };
  }, [saId, offerId]);

  useEffect(() => {
    if (dismissed || !purchases || purchases.length === 0) return;
    const showTimer = setTimeout(() => setVisible(true), FIRST_DELAY_MS);
    return () => clearTimeout(showTimer);
  }, [purchases, dismissed]);

  useEffect(() => {
    if (!visible || dismissed) return;
    const hideTimer = setTimeout(() => {
      setVisible(false);
      const nextTimer = setTimeout(() => {
        setIndex((i) => (purchases ? (i + 1) % purchases.length : 0));
        setVisible(true);
      }, GAP_MS);
      return () => clearTimeout(nextTimer);
    }, VISIBLE_MS);
    return () => clearTimeout(hideTimer);
  }, [visible, dismissed, purchases]);

  if (dismissed || !purchases || purchases.length === 0) return null;
  const current = purchases[index];
  if (!current) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-50 max-w-xs rounded-xl border bg-card p-3 shadow-lg transition-all duration-500 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground/50 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
      <div className="flex items-start gap-2.5 pr-4">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] leading-snug">
            <span className="font-semibold">{current.firstName}</span>
            {current.location ? ` in ${current.location}` : ""} just
            purchased <span className="font-medium">{productName}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {timeAgo(current.purchasedAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
