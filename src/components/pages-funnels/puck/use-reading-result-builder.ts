"use client";

import { useEffect, useMemo, useState } from "react";
import type { Data } from "@puckeditor/core";
import { collectPuckFeaturedOfferIds } from "@/lib/pages-funnels/puck/resolve";
import type { ReadingBlockContext, ReadingResultPageSettings } from "@/types/reading-blocks";

/**
 * Builder-side Reading context for a Reading Result Page (2026-10-21): loads
 * the chosen sample chart with the page's Chart Design and any Featured
 * Offers on the canvas, refreshing only when one of those actually changes
 * (never per keystroke — Puck's metadata must stay referentially stable).
 */
export function useReadingResultBuilder({
  subAccountId,
  pageId,
  settings,
  data,
}: {
  subAccountId: string;
  pageId: string;
  /** Null on any other page type — the hook then does nothing. */
  settings: ReadingResultPageSettings | null;
  data: Data;
}): {
  readingContext: ReadingBlockContext | undefined;
  readingBuilder: { status: "loading" | "ready" | "unavailable"; message?: string };
} {
  const offerKey = useMemo(() => collectPuckFeaturedOfferIds(data).sort().join(","), [data]);
  const [state, setState] = useState<{ ctx?: ReadingBlockContext; status: "loading" | "ready" | "unavailable"; message?: string }>({
    status: settings ? "loading" : "unavailable",
  });
  const sample = settings?.sample;
  const chartDesignSetId = settings?.chartDesignSetId ?? "";

  useEffect(() => {
    if (!settings) {
      setState({ status: "unavailable", message: "Reading blocks work on a Reading Result Page." });
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setState((s) => ({ ...s, status: s.ctx ? "ready" : "loading" }));
      try {
        const qs = new URLSearchParams({ pageId, sample: sample ?? "projector", chartDesignSetId, offers: offerKey });
        const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/result-page-context?${qs}`);
        const body = (await res.json().catch(() => ({}))) as { context?: ReadingBlockContext; error?: string };
        if (cancelled) return;
        if (!res.ok || !body.context) {
          setState({ status: "unavailable", message: body.error ?? "Couldn’t load the sample Reading." });
          return;
        }
        setState({ ctx: body.context, status: "ready" });
      } catch {
        if (!cancelled) setState({ status: "unavailable", message: "Couldn’t load the sample Reading." });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `settings` identity is irrelevant — only its two values matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, pageId, sample, chartDesignSetId, offerKey, !!settings]);

  const readingBuilder = useMemo(() => ({ status: state.status, message: state.message }), [state.status, state.message]);
  return { readingContext: state.ctx, readingBuilder };
}
