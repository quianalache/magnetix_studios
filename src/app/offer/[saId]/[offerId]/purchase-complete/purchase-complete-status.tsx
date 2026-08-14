"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45_000;

interface OneClickUpsell {
  id: string;
  targetOfferId: string;
  targetTitle: string;
  targetPriceCents: number | null;
  targetCurrency: string;
}

function formatPrice(cents: number | null, currency: string): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Polls `/purchase-status` until the Stripe webhook grants access, mirroring
 * the Standalone Course version. If the purchased offer has a published
 * One-Click Upsell, shows an accept/skip interstitial before continuing to
 * the classroom.
 */
export function PurchaseCompleteStatus({
  saId,
  offerId,
  firstCourseId,
}: {
  saId: string;
  offerId: string;
  firstCourseId: string | null;
}) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const [upsell, setUpsell] = useState<OneClickUpsell | null>(null);
  const [upsellBusy, setUpsellBusy] = useState(false);
  const startedAt = useRef(Date.now());

  const continueUrl = firstCourseId
    ? `/course/${saId}/${firstCourseId}/classroom`
    : `/portal/${saId}`;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/offer/${saId}/${offerId}/purchase-status`
        );
        const data = (await res.json().catch(() => ({}))) as {
          paid?: boolean;
          oneClickUpsell?: OneClickUpsell | null;
        };
        if (cancelled) return;
        if (data.paid) {
          if (data.oneClickUpsell) {
            setUpsell(data.oneClickUpsell);
          } else {
            router.push(continueUrl);
          }
          return;
        }
      } catch {
        // Transient network blip — keep polling until the timeout.
      }
      if (cancelled) return;
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [saId, offerId, continueUrl, router]);

  async function acceptUpsell() {
    if (!upsell) return;
    setUpsellBusy(true);
    try {
      const res = await fetch(`/api/offer/${saId}/${offerId}/upsell/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetOfferId: upsell.targetOfferId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        needsManualCheckout?: boolean;
      };
      if (data.ok) {
        router.push(continueUrl);
        return;
      }
      if (data.needsManualCheckout) {
        router.push(`/offer/${saId}/${upsell.targetOfferId}`);
        return;
      }
    } finally {
      setUpsellBusy(false);
    }
  }

  if (upsell) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4">
        <div className="max-w-sm space-y-4 rounded-xl border border-[#E4E4E4] bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium tracking-wide text-[#909090] uppercase">
            Special one-time offer
          </p>
          <p className="text-lg font-semibold text-[#202124]">
            Add {upsell.targetTitle}
            {upsell.targetPriceCents != null &&
              ` for ${formatPrice(upsell.targetPriceCents, upsell.targetCurrency)}`}
            ?
          </p>
          <p className="text-xs text-[#909090]">
            One click — no need to re-enter your card.
          </p>
          <button
            onClick={acceptUpsell}
            disabled={upsellBusy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#202124] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {upsellBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Yes, add it
          </button>
          <button
            onClick={() => router.push(continueUrl)}
            className="text-sm font-medium text-[#909090] underline"
          >
            No thanks, continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4">
      <div className="max-w-sm space-y-3 rounded-xl border border-[#E4E4E4] bg-white p-6 text-center shadow-sm">
        {timedOut ? (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-[#909090]" />
            <p className="text-sm font-medium text-[#202124]">
              Payment received — finishing up
            </p>
            <p className="text-xs text-[#909090]">
              This is taking longer than usual. Refresh in a moment, or check
              your email — access unlocks automatically.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm font-medium text-[#202124] underline"
            >
              Refresh
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#202124]" />
            <p className="text-sm font-medium text-[#202124]">
              Payment received — unlocking your access
            </p>
            <p className="text-xs text-[#909090]">Just a moment…</p>
          </>
        )}
      </div>
    </div>
  );
}
