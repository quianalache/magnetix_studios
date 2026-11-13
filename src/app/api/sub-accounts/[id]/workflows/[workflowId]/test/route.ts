import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { getAdminDb } from "@/lib/firebase/admin";
import { enrollForTest } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

/**
 * POST — start a REAL test run of this workflow's saved version for one
 * contact (runs even on a draft). Not a simulation: emails, texts,
 * webhooks, tag and record changes happen for real.
 *
 * Body: `{ contactId, confirmRealRun: true }` — the explicit confirmation
 * from the Test dialog (CRM Foundations Batch B); a request without it is
 * refused so selecting a contact can never start a run on its own. The
 * contact must belong to this workspace and be visible to the caller
 * (territory scoping). Returns the new run's id for "View run".
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { contactId?: unknown; confirmRealRun?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.contactId !== "string" || !body.contactId) {
    return NextResponse.json({ error: "Choose a contact to test with." }, { status: 400 });
  }
  if (body.confirmRealRun !== true) {
    return NextResponse.json(
      { error: "Confirm that this starts a real test run before starting it." },
      { status: 400 },
    );
  }

  // Territory-scoped members can only test with contacts they can see.
  const scope = await loadEffectiveTerritoryScope(access);
  if (scope.enforce) {
    const c = await getAdminDb().doc(`contacts/${body.contactId}`).get();
    if (!c.exists || c.get("subAccountId") !== subAccountId || !(scope.ids ?? []).includes(String(c.get("territoryId") ?? ""))) {
      return NextResponse.json({ error: "Contact not found" }, { status: 400 });
    }
  }

  const result = await enrollForTest({
    subAccountId,
    workflowId,
    contactId: body.contactId,
    startedByUid: access.uid,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, runId: result.runId ?? null });
}
