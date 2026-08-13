import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/community/member-session";
import { setMemberPassword } from "@/lib/community/member-password";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  const member = await getCurrentMember(saId);
  if (!member) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = (await request.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.newPassword) {
    return NextResponse.json(
      { error: "Enter a new password." },
      { status: 400 }
    );
  }
  const result = await setMemberPassword({
    subAccountId: saId,
    member,
    currentPassword: body.currentPassword,
    newPassword: body.newPassword,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
