import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { resolveAgencyAudience } from "@/lib/server/agency-communications-audience-service";
import { getAgencyRecipientPreference } from "@/lib/server/agency-recipient-preferences-service";
import type { AgencyAudienceSource } from "@/types/agency-communications";

export const dynamic = "force-dynamic";

/** Owner-only: live audience-size preview for the composer, computed the
 *  exact same way /api/agency/communications/send will at fire time —
 *  resolve, then subtract opted-out recipients. */
export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: { audienceSources?: AgencyAudienceSource[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sources = Array.isArray(body.audienceSources) ? body.audienceSources : [];
  if (sources.length === 0) {
    return NextResponse.json({ ok: true, recipients: 0, skipped: 0 });
  }

  const resolved = await resolveAgencyAudience(caller.agencyId!, sources);
  let recipients = 0;
  let skipped = 0;
  for (const r of resolved) {
    const pref = await getAgencyRecipientPreference(caller.agencyId!, r.email);
    if (pref?.emailOptedOut) skipped += 1;
    else recipients += 1;
  }
  return NextResponse.json({ ok: true, recipients, skipped, total: resolved.length });
}
