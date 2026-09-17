import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { listDmableAgencyMembersServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: list/search Persons the viewer can start a DM with. */
export async function GET(request: Request) {
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;
  const q = new URL(request.url).searchParams.get("q") ?? undefined;
  const members = await listDmableAgencyMembersServerSide({
    agencyId: auth.agencyId,
    viewerId: auth.person.id,
    q,
  });
  return NextResponse.json({ members });
}
