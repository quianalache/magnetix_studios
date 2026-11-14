import type { AnalyticsRange, AnalyticsRangeKey, FunnelMetrics, PageGoalInfo, PageMetrics } from "@/lib/analytics/page-funnel-metrics";
import type { FunnelStatus, FunnelStepType } from "@/types/checkout";

/** API: GET /api/sub-accounts/{id}/commerce/analytics?type=funnels&range=30d */
export interface FunnelStepReport {
  id: string;
  name: string;
  type: FunnelStepType;
  order: number;
  pageId: string | null;
  metrics: FunnelMetrics & { visitors: number };
}

export interface FunnelReport {
  id: string;
  name: string;
  status: FunnelStatus;
  updatedAt: number;
  stepCount: number;
  /** Contains a Checkout step — only then does a purchase conversion rate exist. */
  sells: boolean;
  /** First UTC day with tracked data, or null. */
  trackingSince: string | null;
  totals: FunnelMetrics;
  /** The previous equal-length period — only when tracking covered all of it. */
  previous: FunnelMetrics | null;
  daily: Array<FunnelMetrics & { day: string }>;
  steps: FunnelStepReport[];
}

export interface FunnelAnalyticsResponse {
  type: "funnels";
  rangeKey: AnalyticsRangeKey;
  range: AnalyticsRange;
  funnels: FunnelReport[];
  truncated: boolean;
}

export interface PageReport {
  id: string;
  name: string;
  status: string;
  pageType: string | null;
  goal: PageGoalInfo;
  trackingSince: string | null;
  totals: PageMetrics;
  previous: PageMetrics | null;
  daily: Array<PageMetrics & { day: string }>;
}

export interface PageAnalyticsResponse {
  type: "pages";
  rangeKey: AnalyticsRangeKey;
  range: AnalyticsRange;
  pages: PageReport[];
  truncated: boolean;
}
