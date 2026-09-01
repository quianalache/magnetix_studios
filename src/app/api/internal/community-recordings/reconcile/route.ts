import { NextResponse } from "next/server";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  inspectCommunityRecordingReconciliation,
  reconcileCommunityRecordingByProviderEgressId,
} from "@/lib/server/community-recording-reconciliation-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2048)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: { providerEgressId?: unknown; dryRun?: unknown };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 2048)
      return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    body = JSON.parse(rawBody) as {
      providerEgressId?: unknown;
      dryRun?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const providerEgressId =
    typeof body.providerEgressId === "string"
      ? body.providerEgressId.trim()
      : "";
  if (!/^EG_[A-Za-z0-9]{4,128}$/.test(providerEgressId))
    return NextResponse.json(
      { error: "Invalid provider Egress ID" },
      { status: 400 }
    );
  const dryRun = body.dryRun !== false;
  try {
    const plan = dryRun
      ? (await inspectCommunityRecordingReconciliation(providerEgressId)).plan
      : await reconcileCommunityRecordingByProviderEgressId(providerEgressId);
    console.info("[community-recording-reconciliation] admin operation", {
      actorUid: owner.uid,
      providerEgressId,
      dryRun,
      egressStatus: plan.egressStatus,
      outcome: plan.wouldFinalize
        ? "would_finalize"
        : plan.wouldFail
          ? "would_fail"
          : "no_action",
      reason: plan.reason,
    });
    if (!dryRun && !plan.wouldFinalize && !plan.wouldFail)
      return NextResponse.json({ ok: false, ...plan }, { status: 409 });
    return NextResponse.json({ ok: true, ...plan });
  } catch (error) {
    console.error(
      "[community-recording-reconciliation] admin operation failed",
      {
        actorUid: owner.uid,
        providerEgressId,
        dryRun,
        message: error instanceof Error ? error.message : "unknown",
      }
    );
    return NextResponse.json(
      { error: "Reconciliation failed" },
      { status: 500 }
    );
  }
}
