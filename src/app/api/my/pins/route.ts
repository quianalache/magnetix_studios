import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/server/person-session";
import { setPinned } from "@/lib/server/mymagnetix-service";

export const dynamic = "force-dynamic";

/** Toggle a person-scoped pin (Course/Community). Requires a valid mm_session. */
export async function POST(request: Request) {
  const person = await getCurrentPerson();
  if (!person) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { pinKey?: string; pinned?: boolean };
  try {
    body = (await request.json()) as { pinKey?: string; pinned?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.pinKey || typeof body.pinned !== "boolean") {
    return NextResponse.json({ error: "Missing pinKey/pinned" }, { status: 400 });
  }

  await setPinned(person.id, body.pinKey, body.pinned);
  return NextResponse.json({ ok: true });
}
