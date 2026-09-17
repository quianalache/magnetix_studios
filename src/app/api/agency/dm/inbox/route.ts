import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { listAgencyInboxServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: the signed-in Person's DM inbox (thread list). */
export async function GET() {
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;
  const items = await listAgencyInboxServerSide({ agencyId: auth.agencyId, viewerId: auth.person.id });
  return NextResponse.json({ items });
}
