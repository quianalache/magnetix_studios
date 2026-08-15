import { NextResponse } from "next/server";
import { clearPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

/**
 * Clears ONLY the global `mm_session` cookie. Deliberately does not touch
 * the Firebase staff session (`__session`) or any tenant
 * `ls_member_session` — logging out of MyMagnetix must never silently sign
 * a dual-role person out of the CRM or an already-open business portal tab.
 */
export async function POST() {
  await clearPersonSessionCookie();
  return NextResponse.json({ ok: true });
}
