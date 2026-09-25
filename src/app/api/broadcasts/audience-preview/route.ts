import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import { AudienceListMissingError, resolveAudience } from "@/lib/broadcasts/audience";
import type { BroadcastAudienceFilter } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Broadcast audience preview for a Contact List audience (Contacts
 * redesign, 2026-09-25). Runs the EXACT send-time resolver
 * (`resolveAudience`, same territory scope as the send route) so the count
 * the operator confirms is the count the send route will recompute — the
 * `confirmedAudienceSize` consistency check keeps working unchanged.
 *
 * Needed because a Contact List can hold access conditions ("purchased
 * offer X") that only the server can evaluate; plain condition audiences
 * keep their existing client-side preview.
 *
 * Body: { subAccountId, audienceFilter }. Returns counts + recipient ids
 * (for the composer's Test Mode intersection) — never contact data.
 */
export async function POST(request: Request) {
  let body: { subAccountId?: string; audienceFilter?: BroadcastAudienceFilter };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subAccountId = body.subAccountId?.trim();
  const filter = body.audienceFilter;
  if (!subAccountId || !filter || filter.kind !== "list" || !filter.listId) {
    return NextResponse.json(
      { error: "subAccountId and a Contact List audienceFilter are required" },
      { status: 400 },
    );
  }
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const scope = await loadEffectiveTerritoryScope(access);
  try {
    const audience = await resolveAudience(
      subAccountId,
      filter,
      scope.enforce ? (scope.ids ?? []) : null,
      null,
    );
    return NextResponse.json({
      recipients: audience.recipients.length,
      skipped: audience.skipped.length,
      matching: audience.recipients.length + audience.skipped.length,
      recipientIds: audience.recipients.map((c) => c.id),
    });
  } catch (err) {
    if (err instanceof AudienceListMissingError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }
}
