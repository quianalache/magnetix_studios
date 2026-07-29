"use client";

import { useEffect, useRef } from "react";
import { readAttributionFromBrowser } from "@/lib/attribution";

/**
 * Fires a "visit" beacon to `/api/track/visit` once on mount — the visit
 * counterpart to the attribution already captured at conversion time (a
 * booking, a purchase). Placement matters: mount this ONLY on the actual
 * public route a real visitor lands on, never inside a shared preview/
 * editor component that also renders elsewhere (would count staff editing
 * sessions as visitors) — see the booking/offer wiring for the concrete
 * placement decision.
 */
export function AttributionVisitLogger({
  subAccountId,
  pageType,
  pageId,
}: {
  subAccountId: string;
  pageType: "booking" | "offer";
  pageId: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const attribution = readAttributionFromBrowser(); // null is fine — still counts as a visit
    fetch("/api/track/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subAccountId, pageType, pageId, attribution }),
      keepalive: true,
    }).catch(() => {});
  }, [subAccountId, pageType, pageId]);

  return null;
}
