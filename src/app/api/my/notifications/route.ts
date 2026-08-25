import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listRecentNotificationsForPerson, countUnreadForPerson } from "@/lib/server/notification-service";

export const dynamic = "force-dynamic";

/**
 * The notification panel's real data source — `personId` is resolved from
 * the authenticated `mm_session` cookie only, never trusted from the
 * client (see notification-service.ts's own tenancy note). Returns both
 * the bounded recent list and the real unread count in one round trip —
 * the panel needs both the instant it opens.
 */
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([
    listRecentNotificationsForPerson(person.id),
    countUnreadForPerson(person.id),
  ]);

  return NextResponse.json({ ok: true, notifications, unreadCount });
}
