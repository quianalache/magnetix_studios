import { NextResponse } from "next/server";
import { consumePersonPasswordToken } from "@/lib/server/person-password";
import { setPersonSessionCookie } from "@/lib/server/person-session";

export const dynamic = "force-dynamic";

/** Consume a MyMagnetix set/reset-password token and sign the person in. */
export async function POST(request: Request) {
  let body: { token?: string; password?: string };
  try {
    body = (await request.json()) as { token?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.token?.trim();
  const password = body.password ?? "";
  if (!token) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  const result = await consumePersonPasswordToken({ token, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await setPersonSessionCookie(result.sessionToken);
  return NextResponse.json({ ok: true, redirectTo: "/my/gateway" });
}
