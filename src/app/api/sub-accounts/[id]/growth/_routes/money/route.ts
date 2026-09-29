import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { addMoneyEntry, listMoneyEntries } from "@/lib/server/growth-service";
import type { MoneyEntryKind } from "@/types/growth";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const entries = await listMoneyEntries(
    subAccountId,
    kind === "income" || kind === "expense" ? kind : undefined,
  );
  return NextResponse.json({ ok: true, entries });
}

export async function POST(
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

  const kind: MoneyEntryKind | null =
    body.kind === "income" || body.kind === "expense" ? body.kind : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : NaN;
  if (!kind || !title || Number.isNaN(amount)) {
    return NextResponse.json({ error: "kind, title, and amount are required" }, { status: 400 });
  }
  const date = typeof body.date === "string" && body.date ? new Date(body.date) : new Date();

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const entry = await addMoneyEntry({
    agencyId,
    subAccountId,
    kind,
    title,
    amount,
    date,
    recurring: body.recurring === true,
    linkedOfferId: typeof body.linkedOfferId === "string" && body.linkedOfferId ? body.linkedOfferId : null,
  });
  return NextResponse.json({ ok: true, entry }, { status: 201 });
}
