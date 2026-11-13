import { NextResponse } from "next/server";
import { handleRunsGet } from "@/lib/server/workflow-runs-route";

export const dynamic = "force-dynamic";

/** GET — workspace-wide runs (default Failed; filters: status, workflowId, range, q, page) or `?runId=` detail. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;
  return handleRunsGet(request, subAccountId, null);
}
