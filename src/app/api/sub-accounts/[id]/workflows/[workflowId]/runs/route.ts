import { NextResponse } from "next/server";
import { handleRunsGet } from "@/lib/server/workflow-runs-route";

export const dynamic = "force-dynamic";

/** GET — this workflow's runs (filters: status, range, q, page) or `?runId=` detail. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  return handleRunsGet(request, subAccountId, workflowId);
}
