import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { listAgencyCommunications } from "@/lib/server/agency-communications-service";

export const dynamic = "force-dynamic";

/** Owner-only: list every Agency Communication (drafts + sent history). */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;
  const communications = await listAgencyCommunications(caller.agencyId!);
  return NextResponse.json({ ok: true, communications });
}
