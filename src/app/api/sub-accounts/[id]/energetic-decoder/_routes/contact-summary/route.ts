import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listContactDecoderSummaries } from "@/lib/server/readings-library-service";

/**
 * Contact profile → Energetic Decoding card (Wave 2 follow-up, 2026-10-15).
 * `?contactId=` — this contact's Profiles (plus any legacy reading without
 * one) with the latest reading's Type / Authority / Profile / Sun sign.
 * Read-only; tenancy-scoped by the sub-account in the path.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const contactId = new URL(request.url).searchParams.get("contactId") ?? "";
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  return NextResponse.json({ ok: true, people: await listContactDecoderSummaries(subAccountId, contactId) });
}
