import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAudiencePickerOptions } from "@/lib/server/agency-communications-audience-service";

export const dynamic = "force-dynamic";

/** Owner-only: the dropdown contents for the Agency audience picker
 *  (plans, communities, courses, offers) — lightweight labels only, not
 *  resolved recipient lists. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const options = await listAudiencePickerOptions(caller.agencyId!);
  return NextResponse.json({ ok: true, ...options });
}
