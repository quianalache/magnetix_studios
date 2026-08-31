"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBillingPrice } from "@/lib/billing/status";
import { readAttributionFromBrowser } from "@/lib/attribution";

/**
 * Public Magnetix SaaS Signup — the interactive half of
 * `/get-started/[planSlug]`. Collects only the minimum needed before Stripe
 * Checkout (business name + email — Stripe Checkout itself collects
 * payment/billing details), lets the visitor pick monthly/annual when both
 * are offered.
 *
 * Attribution (2026-08-31, Agency Acquisition Foundation): now captured via
 * `readAttributionFromBrowser()` — the SAME helper Forms/Booking/Course-
 * Offer checkouts already use — instead of a narrower one-off UTM+referrer
 * shape. Picks up `fbclid`/`gclid`/`landingPage` too, and is normalized
 * server-side by the SAME `normalizeAttribution()` pipeline every other
 * public page's submission goes through (Sales & Affiliate Infrastructure
 * audit, Part 4/8). `?ref=` (a future affiliate/referral code) is read
 * separately — see the audit's Part 7/15 on why it's kept apart from
 * marketing attribution.
 */

interface Props {
  planSlug: string;
  hasAnnual: boolean;
  priceMonthlyCents: number;
  priceAnnualCents: number | null;
  currency: string;
}

export function PlanSignupForm({
  planSlug,
  hasAnnual,
  priceMonthlyCents,
  priceAnnualCents,
  currency,
}: Props) {
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Captured once on mount — a fresh page load is the only moment
  // document.referrer / the URL's own query string reflect where the
  // visitor actually came from (GitPage, an email link, social, etc.).
  const [attribution, setAttribution] = useState<ReturnType<
    typeof readAttributionFromBrowser
  > | null>(null);
  useEffect(() => {
    setAttribution(readAttributionFromBrowser());
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessName.trim()) {
      setError("Enter your business or workspace name.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout/platform-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planSlug,
          interval,
          email: email.trim(),
          businessName: businessName.trim(),
          attribution,
          referralCode: searchParams.get("ref"),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Something went wrong. Please try again.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hasAnnual && (
        <div className="inline-flex w-full rounded-md border p-0.5">
          {(["month", "year"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setInterval(opt)}
              disabled={submitting}
              className={cn(
                "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                interval === opt
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/60",
              )}
            >
              {opt === "month"
                ? `Monthly · ${formatBillingPrice(priceMonthlyCents, currency)}`
                : `Annual · ${formatBillingPrice(priceAnnualCents, currency)}`}
            </button>
          ))}
        </div>
      )}

      <div>
        <label
          htmlFor="businessName"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Business / workspace name
        </label>
        <Input
          id="businessName"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Your business name"
          maxLength={120}
          disabled={submitting}
          required
        />
      </div>

      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Email
        </label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          disabled={submitting}
          required
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          We&apos;ll send your login link here after payment.
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            Starting checkout…
          </>
        ) : (
          "Continue to payment"
        )}
      </Button>
    </form>
  );
}
