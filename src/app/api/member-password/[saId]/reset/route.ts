import { NextResponse } from "next/server";
import { consumeMemberPasswordToken } from "@/lib/community/member-password";
import { setMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  let body: { token?: string; password?: string; next?: string };
  try {
    body = (await request.json()) as {
      token?: string;
      password?: string;
      next?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || !body.password) {
    return NextResponse.json(
      { error: "Invalid reset request." },
      { status: 400 }
    );
  }
  const result = await consumeMemberPasswordToken({
    subAccountId: saId,
    token: body.token,
    password: body.password,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await setMemberSessionCookie(result.sessionToken);
  const redirectTo =
    typeof body.next === "string" && body.next.startsWith("/")
      ? body.next
      : `/portal/${saId}`;
  return NextResponse.json({ ok: true, redirectTo });
}
