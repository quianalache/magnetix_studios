import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { addSocialLog, listSocialLogs } from "@/lib/server/growth-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id: subAccountId, platformId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const logs = await listSocialLogs(platformId);
  return NextResponse.json({ ok: true, logs });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; platformId: string }> },
) {
  const { id: subAccountId, platformId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { date?: string; count?: number };
  try {
    body = (await request.json()) as { date?: string; count?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const count = typeof body.count === "number" && Number.isFinite(body.count) ? Math.max(0, Math.round(body.count)) : null;
  if (count === null) {
    return NextResponse.json({ error: "A follower/subscriber count is required" }, { status: 400 });
  }
  const date = body.date ? new Date(body.date) : new Date();

  const log = await addSocialLog(platformId, { date, count });
  return NextResponse.json({ ok: true, log }, { status: 201 });
}
