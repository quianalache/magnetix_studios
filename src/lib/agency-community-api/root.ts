import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import {
  createAgencyGroupServerSide,
  listGroupsForAgency,
} from "@/lib/server/community-agency-service";

export const dynamic = "force-dynamic";

/** Agency Community — list/create Agency-owned communities. Owner-only. */
export async function GET(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  const groups = await listGroupsForAgency(caller.agencyId!);
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let body: { name?: string; about?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Community name is required." }, { status: 400 });
  }

  const group = await createAgencyGroupServerSide({
    agencyId: caller.agencyId!,
    createdByUid: caller.uid,
    name,
    about: body.about,
  });
  return NextResponse.json({ ok: true, group });
}
