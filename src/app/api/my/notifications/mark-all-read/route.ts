import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import { markAllReadForPerson } from "@/lib/server/notification-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await markAllReadForPerson(person.id);
  return NextResponse.json({ ok: true });
}
