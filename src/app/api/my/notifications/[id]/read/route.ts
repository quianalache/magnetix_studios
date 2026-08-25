import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import { markNotificationRead } from "@/lib/server/notification-service";

export const dynamic = "force-dynamic";

/**
 * Mark one notification read. `personId` comes only from the session — the
 * real ownership check happens inside `markNotificationRead` itself (not
 * just here), which silently no-ops on a notification that doesn't belong
 * to this person rather than confirming/denying it exists.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await ctx.params;
  await markNotificationRead(id, person.id);
  return NextResponse.json({ ok: true });
}
