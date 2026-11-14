"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { commerceFetch } from "@/lib/client/commerce-api";
import type { AnalyticsRangeKey } from "@/lib/analytics/page-funnel-metrics";
import type { FunnelAnalyticsResponse, PageAnalyticsResponse } from "@/types/page-funnel-analytics";

export type AnalyticsLoadState = "loading" | "ready" | "error";

/**
 * One workspace's Page & Funnel analytics (the same server response feeds
 * Pages & Funnels and Reports, so their numbers always agree).
 */
export function usePageFunnelAnalytics<T extends "funnels" | "pages">(
  subAccountId: string,
  type: T,
  range: AnalyticsRangeKey,
  enabled = true,
): { state: AnalyticsLoadState; data: (T extends "funnels" ? FunnelAnalyticsResponse : PageAnalyticsResponse) | null; error: string | null; reload: () => void } {
  type Data = T extends "funnels" ? FunnelAnalyticsResponse : PageAnalyticsResponse;
  const [state, setState] = useState<AnalyticsLoadState>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled || !subAccountId) return;
    const mine = ++seq.current;
    setState("loading");
    setError(null);
    commerceFetch<Data>(subAccountId, `analytics?type=${type}&range=${range}`)
      .then((d) => {
        if (mine !== seq.current) return;
        setData(d);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (mine !== seq.current) return;
        setError(err instanceof Error ? err.message : "Analytics couldn't be loaded.");
        setState("error");
      });
  }, [subAccountId, type, range, enabled, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, data, error, reload };
}
