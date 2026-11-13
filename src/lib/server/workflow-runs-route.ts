import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { getRunDetail, listRuns, RunsError } from "@/lib/server/workflow-runs-service";
import type { RunRange, RunStatusFilter } from "@/types/workflow-runs";

const STATUSES = new Set(["all", "running", "waiting", "completed", "failed", "exited"]);
const RANGES = new Set(["7d", "30d", "90d", "all"]);

/**
 * Shared GET handler for the per-workflow Runs page and the workspace-wide
 * Runs view (CRM Foundations Batch B). `?runId=` returns one run's detail;
 * otherwise a filtered, paged list. Any active member (same as before);
 * territory scope applied server-side.
 */
export async function handleRunsGet(request: Request, subAccountId: string, workflowId: string | null): Promise<NextResponse> {
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const scope = await loadEffectiveTerritoryScope(access);
  const territoryIds = scope.enforce ? (scope.ids ?? []) : null;
  const url = new URL(request.url);
  const p = url.searchParams;
  try {
    const runId = p.get("runId");
    if (runId) {
      return NextResponse.json(await getRunDetail({ subAccountId, territoryIds, runId, workflowId }));
    }
    const status = (STATUSES.has(p.get("status") ?? "") ? p.get("status") : workflowId ? "all" : "failed") as RunStatusFilter;
    const range = (RANGES.has(p.get("range") ?? "") ? p.get("range") : "30d") as RunRange;
    return NextResponse.json(
      await listRuns({
        subAccountId,
        territoryIds,
        workflowId,
        status,
        range,
        q: (p.get("q") ?? "").slice(0, 100),
        page: Number(p.get("page") ?? 1) || 1,
        filterWorkflowId: workflowId ? null : p.get("workflowId") || null,
      }),
    );
  } catch (err) {
    if (err instanceof RunsError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[workflow-runs] failed", err);
    return NextResponse.json({ error: "Couldn't load runs. Try again." }, { status: 500 });
  }
}
