import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { setBlockServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: block / un-block another Person. */
export async function POST(request: Request) {
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;

  let body: { otherId?: string; blocked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.otherId) return NextResponse.json({ error: "Missing member" }, { status: 400 });

  await setBlockServerSide({
    agencyId: auth.agencyId,
    blockerId: auth.person.id,
    blockedId: body.otherId,
    blocked: body.blocked !== false,
  });
  return NextResponse.json({ ok: true });
}
