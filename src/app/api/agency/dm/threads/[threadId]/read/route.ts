import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { markAgencyThreadReadServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: mark a thread read up to now. */
export async function POST(_request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await ctx.params;
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;
  await markAgencyThreadReadServerSide({ agencyId: auth.agencyId, threadId, viewerId: auth.person.id });
  return NextResponse.json({ ok: true });
}
