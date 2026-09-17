import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { sendAgencyMessageServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: send a DM (creates the thread on first send). */
export async function POST(request: Request) {
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;

  let body: { otherId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.otherId || !body.body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const result = await sendAgencyMessageServerSide({
      agencyId: auth.agencyId,
      senderId: auth.person.id,
      otherId: body.otherId,
      body: body.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't send" }, { status: 400 });
  }
}
