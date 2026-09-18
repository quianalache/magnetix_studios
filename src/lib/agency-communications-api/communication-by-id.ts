import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { getAgencyCommunication, deleteAgencyCommunicationDraft } from "@/lib/server/agency-communications-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const communication = await getAgencyCommunication(caller.agencyId!, id);
  if (!communication) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, communication });
}

/** Draft-only delete — mirrors DELETE /api/broadcasts/[broadcastId]. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const { id } = await ctx.params;
  const result = await deleteAgencyCommunicationDraft(caller.agencyId!, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
