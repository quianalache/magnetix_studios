import { NextResponse } from "next/server";
import { requireAgencyPerson } from "@/lib/server/agency-community-access";
import { hasBlocked, listAgencyMessagesServerSide } from "@/lib/server/agency-community-dm-service";

export const dynamic = "force-dynamic";

/** Agency Community: poll a thread's messages (optionally only after `since`). */
export async function GET(request: Request, ctx: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await ctx.params;
  const auth = await requireAgencyPerson();
  if (auth instanceof NextResponse) return auth;

  const sinceParam = new URL(request.url).searchParams.get("since");
  const sinceMs = sinceParam ? Number(sinceParam) : undefined;
  const messages = await listAgencyMessagesServerSide({
    agencyId: auth.agencyId,
    threadId,
    viewerId: auth.person.id,
    sinceMs: Number.isFinite(sinceMs) ? sinceMs : undefined,
  });
  if (messages === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let blockedByMe: boolean | undefined;
  if (!sinceParam) {
    const otherId = threadId.split("__").find((x) => x !== auth.person.id);
    if (otherId) blockedByMe = await hasBlocked(auth.agencyId, auth.person.id, otherId);
  }
  return NextResponse.json({ messages, blockedByMe });
}
