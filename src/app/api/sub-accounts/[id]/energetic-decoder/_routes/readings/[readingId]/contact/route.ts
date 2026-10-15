import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { readingContactIsBroken, relinkLegacyReadingContact } from "@/lib/server/reading-contact-repair-service";

/**
 * Legacy reading → contact repair (Wave 2 follow-up, 2026-10-15).
 *
 * GET  — `{ broken }`: whether this reading's contact still resolves in the
 *        sub-account (drives the workspace's "Link contact" notice).
 * POST — `{ contactId }`: re-point a BROKEN link to an existing contact.
 *        Refuses (409) when the current link is healthy — this is a repair
 *        for the few readings whose contact was deleted, not a reassign tool.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; readingId: string }> },
) {
  const { id: subAccountId, readingId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const reading = await getReadingById(subAccountId, readingId);
  if (!reading) return NextResponse.json({ error: "Reading not found" }, { status: 404 });
  return NextResponse.json({ ok: true, broken: await readingContactIsBroken(subAccountId, reading.contactId) });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; readingId: string }> },
) {
  const { id: subAccountId, readingId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => ({}))) as { contactId?: unknown };
  const result = await relinkLegacyReadingContact(
    subAccountId,
    readingId,
    typeof body.contactId === "string" ? body.contactId : "",
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
