import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { updateRitual, toggleRitual, deleteRitual } from "@/lib/server/reflection-service";
import type { RitualFrequency, RitualTimeBlock } from "@/types/reflection";

const FREQUENCIES: RitualFrequency[] = ["daily", "weekly", "custom"];
const TIME_BLOCKS: RitualTimeBlock[] = ["AM", "Midday", "PM", "Evening"];

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; ritualId: string }> },
) {
  const { id: subAccountId, ritualId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Toggling a day's completion is a distinct action from editing the
    // ritual's own fields — a request carries one or the other.
    if (typeof body.toggleDate === "string") {
      const ritual = await toggleRitual(subAccountId, ritualId, body.toggleDate);
      return NextResponse.json({ ok: true, ritual });
    }

    const fields: Record<string, unknown> = {};
    if (typeof body.name === "string") fields.name = body.name.trim().slice(0, 200);
    if (typeof body.description === "string") fields.description = body.description.slice(0, 2000);
    if (FREQUENCIES.includes(body.frequency as RitualFrequency)) fields.frequency = body.frequency;
    if (TIME_BLOCKS.includes(body.timeBlock as RitualTimeBlock)) fields.timeBlock = body.timeBlock;

    await updateRitual(subAccountId, ritualId, fields);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ritual not found" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; ritualId: string }> },
) {
  const { id: subAccountId, ritualId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteRitual(subAccountId, ritualId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Ritual not found" }, { status: 404 });
  }
}
