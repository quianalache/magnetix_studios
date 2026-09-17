import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { unreadAgencyThreadCount } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: unread DM thread count (header badge poll). */
export async function GET() {
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return NextResponse.json({ count: 0 }, { status: 200 });
  const count = await unreadAgencyThreadCount({ agencyId: auth.agencyId, viewerId: auth.person.id });
  return NextResponse.json({ count });
}
