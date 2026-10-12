import "server-only";

import { getChartDesignSetsByIds } from "@/lib/server/chart-design-set-service";
import { attachChartDesignsFromSets, chartDesignSetIdsOf } from "@/lib/energetics/report-charts";
import type { ReportPage } from "@/types/report-blocks";

/**
 * Attaches each chart element's saved Chart Design (resolved from its
 * `payload.chartDesignSetId`, this workspace only) as `payload.chartDesigns`
 * so the web viewer and the PDF draw it with that design. Any
 * `chartDesigns` already on a page is discarded first — it is never trusted
 * from saved/draft data. A missing or foreign set attaches nothing, so the
 * element falls back to the reading's own chart design. Read-only.
 *
 * Live surfaces call this per render; report generation calls it once and
 * stores the result in the snapshot (frozen, like chart styles).
 */
export async function attachReportChartDesigns(subAccountId: string, pages: ReportPage[]): Promise<ReportPage[]> {
  const sets = await getChartDesignSetsByIds(subAccountId, chartDesignSetIdsOf(pages));
  return attachChartDesignsFromSets(pages, sets);
}
