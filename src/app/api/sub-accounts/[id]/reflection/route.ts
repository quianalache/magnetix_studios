import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  getDailyReflection,
  upsertDailyReflection,
  getDailyOperationalStats,
} from "@/lib/server/reflection-service";
import { emptyDailyReflectionFields } from "@/types/reflection";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(searchParams: URLSearchParams): string {
  const raw = searchParams.get("date");
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayStr();
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const { searchParams } = new URL(request.url);
  const date = parseDate(searchParams);

  const [reflection, stats] = await Promise.all([
    getDailyReflection(subAccountId, date),
    getDailyOperationalStats(subAccountId, date),
  ]);
  return NextResponse.json({ ok: true, date, reflection, stats });
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

  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayStr();

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const defaults = emptyDailyReflectionFields();
  const fields: Partial<typeof defaults> = {};
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    if (typeof body[key] === "string") {
      fields[key] = (body[key] as string).slice(0, 4000);
    }
  }

  const reflection = await upsertDailyReflection({ agencyId, subAccountId, date, fields });
  return NextResponse.json({ ok: true, reflection });
}
