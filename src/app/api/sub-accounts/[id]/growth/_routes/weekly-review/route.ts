import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getWeeklyReview,
  upsertWeeklyReview,
  weekStartOf,
} from "@/lib/server/growth-service";

function parseWeekStart(searchParams: URLSearchParams): Date {
  const raw = searchParams.get("weekStart");
  const d = raw ? new Date(raw) : new Date();
  return weekStartOf(Number.isNaN(d.getTime()) ? new Date() : d);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { searchParams } = new URL(request.url);
  const weekStart = parseWeekStart(searchParams);
  const review = await getWeeklyReview(subAccountId, weekStart);
  return NextResponse.json({ ok: true, review, weekStart: weekStart.toISOString() });
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const weekStart = weekStartOf(
    typeof body.weekStart === "string" && body.weekStart ? new Date(body.weekStart) : new Date(),
  );
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");

  const review = await upsertWeeklyReview({
    agencyId,
    subAccountId,
    weekStart,
    hoursTracked:
      typeof body.hoursTracked === "number" && Number.isFinite(body.hoursTracked)
        ? body.hoursTracked
        : 0,
    biggestWin: str(body.biggestWin),
    lessonLearned: str(body.lessonLearned),
    needsAttention: str(body.needsAttention),
    priority1: str(body.priority1),
    priority2: str(body.priority2),
    priority3: str(body.priority3),
    revenueGoal:
      typeof body.revenueGoal === "number" && Number.isFinite(body.revenueGoal)
        ? body.revenueGoal
        : null,
  });
  return NextResponse.json({ ok: true, review });
}
