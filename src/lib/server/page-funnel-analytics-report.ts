import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { listFunnels, listSteps } from "@/lib/server/checkout/funnels-service";
import { goalForPage, listAnalyticsPages, pageDailyDocs, pageTrackingSince } from "@/lib/server/page-analytics-service";
import {
  analyticsKey,
  comparable,
  dayList,
  EMPTY_FUNNEL_METRICS,
  EMPTY_PAGE_METRICS,
  funnelDayMetrics,
  funnelStepDayMetrics,
  pageDayMetrics,
  rangeFor,
  sumFunnelMetrics,
  sumPageMetrics,
  type AnalyticsRangeKey,
  type RawFunnelDaily,
  type RawPageDaily,
} from "@/lib/analytics/page-funnel-metrics";
import type { FunnelAnalyticsResponse, FunnelReport, PageAnalyticsResponse, PageReport } from "@/types/page-funnel-analytics";

/**
 * Builds the Page & Funnel analytics the Pages & Funnels screen and
 * Reports both render (one response → the two views always agree). Every
 * number comes from page-funnel-metrics.ts. Reads are bounded: a funnel or
 * page with no tracked data costs one indexed read; otherwise only the days
 * since tracking began (within the range + its comparison period) are read.
 */
export const FUNNEL_ANALYTICS_LIMIT = 100;

const funnelDailyCol = (funnelId: string) => getAdminDb().collection(`funnels/${funnelId}/analyticsDaily`);

/** First UTC day with this workspace's data (a rollup naming another workspace is ignored). */
async function funnelTrackingSince(funnelId: string, subAccountId: string): Promise<string | null> {
  const snap = await funnelDailyCol(funnelId).orderBy("day", "asc").limit(10).get();
  return (snap.docs.find((d) => d.get("subAccountId") === subAccountId)?.get("day") as string | undefined) ?? null;
}

async function funnelDailyDocs(funnelId: string, subAccountId: string, days: string[]): Promise<RawFunnelDaily[]> {
  if (!days.length) return [];
  const snaps = await getAdminDb().getAll(...days.map((d) => funnelDailyCol(funnelId).doc(d)));
  return snaps.filter((s) => s.exists && s.get("subAccountId") === subAccountId).map((s) => ({ ...(s.data() as RawFunnelDaily), day: s.id }));
}

/** Days of [prevFrom, to] on or after tracking began. */
function trackedDays(trackingSince: string | null, from: string, to: string): string[] {
  if (!trackingSince || trackingSince > to) return [];
  return dayList(trackingSince > from ? trackingSince : from, to);
}

export async function buildFunnelAnalytics(subAccountId: string, rangeKey: AnalyticsRangeKey, now = Date.now()): Promise<FunnelAnalyticsResponse> {
  const range = rangeFor(rangeKey, now);
  const all = await listFunnels(subAccountId);
  const funnels = all.slice(0, FUNNEL_ANALYTICS_LIMIT);
  const reports = await Promise.all(
    funnels.map(async (f): Promise<FunnelReport> => {
      const [steps, trackingSince] = await Promise.all([listSteps(f.id), funnelTrackingSince(f.id, subAccountId)]);
      const docs = await funnelDailyDocs(f.id, subAccountId, trackedDays(trackingSince, range.prevFrom, range.to));
      const byDay = new Map(docs.map((d) => [d.day, d]));
      const current = dayList(range.from, range.to);
      const daily = current.map((day) => ({ day, ...(byDay.has(day) ? funnelDayMetrics(byDay.get(day)!) : { ...EMPTY_FUNNEL_METRICS, revenueByCurrency: {} }) }));
      const totals = sumFunnelMetrics(daily);
      const previous = comparable(trackingSince, range)
        ? sumFunnelMetrics(dayList(range.prevFrom, range.prevTo).map((day) => (byDay.has(day) ? funnelDayMetrics(byDay.get(day)!) : { ...EMPTY_FUNNEL_METRICS, revenueByCurrency: {} })))
        : null;
      const currentDocs = current.map((d) => byDay.get(d)).filter((d): d is RawFunnelDaily => !!d);
      return {
        id: f.id,
        name: f.name,
        status: f.status,
        updatedAt: f.updatedAt,
        stepCount: steps.length,
        sells: steps.some((s) => s.type === "checkout"),
        trackingSince,
        totals,
        previous,
        daily,
        steps: steps.map((s) => {
          const perDay = currentDocs.map((d) => funnelStepDayMetrics(d, analyticsKey(s.id)));
          const metrics = perDay.reduce(
            (acc, m) => ({ ...sumFunnelMetrics([acc, m]), visitors: acc.visitors + m.visitors }),
            { ...EMPTY_FUNNEL_METRICS, revenueByCurrency: {}, visitors: 0 },
          );
          return { id: s.id, name: s.name, type: s.type, order: s.order, pageId: s.pageId ?? null, metrics };
        }),
      };
    }),
  );
  return { type: "funnels", rangeKey, range, funnels: reports, truncated: all.length > funnels.length };
}

export async function buildPageAnalytics(subAccountId: string, rangeKey: AnalyticsRangeKey, now = Date.now()): Promise<PageAnalyticsResponse> {
  const range = rangeFor(rangeKey, now);
  const { pages, truncated } = await listAnalyticsPages(subAccountId);
  const reports = await Promise.all(
    pages.map(async (p): Promise<PageReport> => {
      const trackingSince = await pageTrackingSince(p.id, subAccountId);
      const docs: RawPageDaily[] = await pageDailyDocs(p, trackedDays(trackingSince, range.prevFrom, range.to));
      const byDay = new Map(docs.map((d) => [d.day, d]));
      const metricsFor = (day: string) => (byDay.has(day) ? pageDayMetrics(byDay.get(day)!) : { ...EMPTY_PAGE_METRICS, revenueByCurrency: {} });
      const daily = dayList(range.from, range.to).map((day) => ({ day, ...metricsFor(day) }));
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        pageType: p.pageType,
        goal: goalForPage(p),
        trackingSince,
        totals: sumPageMetrics(daily),
        previous: comparable(trackingSince, range) ? sumPageMetrics(dayList(range.prevFrom, range.prevTo).map(metricsFor)) : null,
        daily,
      };
    }),
  );
  return { type: "pages", rangeKey, range, pages: reports, truncated };
}
