import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { addSocialPlatform, listSocialPlatforms } from "@/lib/server/growth-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const platforms = await listSocialPlatforms(subAccountId);
  return NextResponse.json({ ok: true, platforms });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { platform?: string; startedAt?: string };
  try {
    body = (await request.json()) as { platform?: string; startedAt?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const platform = (body.platform ?? "").trim().slice(0, 80);
  if (!platform) {
    return NextResponse.json({ error: "Platform name is required" }, { status: 400 });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;

  const created = await addSocialPlatform({
    agencyId,
    subAccountId,
    platform,
    startedAt: startedAt && !Number.isNaN(startedAt.getTime()) ? startedAt : null,
  });
  return NextResponse.json({ ok: true, platform: created }, { status: 201 });
}
