import { NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listRecentNotificationsForPerson, countUnreadForPerson } from "@/lib/server/notification-service";

export const dynamic = "force-dynamic";

/** Firestore Timestamps serialize over `NextResponse.json()` as a raw
 *  `{_seconds, _nanoseconds}` object, not something `new Date()` can parse
 *  — the client needs a real ISO string. */
function toIso(ts: Timestamp | null): string | null {
  return ts ? ts.toDate().toISOString() : null;
}

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

  const serialized = notifications.map((n) => ({
    ...n,
    createdAt: toIso(n.createdAt),
    readAt: toIso(n.readAt),
  }));

  return NextResponse.json({ ok: true, notifications: serialized, unreadCount });
}
