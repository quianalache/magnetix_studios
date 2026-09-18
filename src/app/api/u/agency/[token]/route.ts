import "server-only";

import { NextResponse } from "next/server";
import { verifyAgencyUnsubscribeToken } from "@/lib/automations/agency-unsubscribe-token";
import { unsubscribeAgencyRecipientServerSide } from "@/lib/server/agency-recipient-preferences-service";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";

export const dynamic = "force-dynamic";

/**
 * Public unsubscribe endpoint for Agency Communications — the agency-scope
 * sibling of /api/u/[token]. POST-only (same reasoning: link previewers
 * shouldn't opt someone out via a GET). Writes to
 * agencies/{agencyId}/recipientPreferences, never a tenant Contact — see
 * agency-recipient-preferences-service.ts's own doc comment.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const email = verifyAgencyUnsubscribeToken(token);
  if (!email) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await unsubscribeAgencyRecipientServerSide(agencyId, email);
  return NextResponse.json({ ok: true });
}
