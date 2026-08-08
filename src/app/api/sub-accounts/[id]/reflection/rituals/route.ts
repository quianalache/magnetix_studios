import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listRituals, createRitual } from "@/lib/server/reflection-service";
import type { RitualFrequency, RitualTimeBlock } from "@/types/reflection";

const FREQUENCIES: RitualFrequency[] = ["daily", "weekly", "custom"];
const TIME_BLOCKS: RitualTimeBlock[] = ["AM", "Midday", "PM", "Evening"];

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const rituals = await listRituals(subAccountId);
  return NextResponse.json({ ok: true, rituals });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const description = typeof body.description === "string" ? body.description.slice(0, 2000) : "";
  const frequency = FREQUENCIES.includes(body.frequency as RitualFrequency)
    ? (body.frequency as RitualFrequency)
    : "daily";
  const timeBlock = TIME_BLOCKS.includes(body.timeBlock as RitualTimeBlock)
    ? (body.timeBlock as RitualTimeBlock)
    : "AM";

  const ritual = await createRitual({
    agencyId: access.agencyId ?? "",
    subAccountId,
    name,
    description,
    frequency,
    timeBlock,
  });
  return NextResponse.json({ ok: true, ritual });
}
