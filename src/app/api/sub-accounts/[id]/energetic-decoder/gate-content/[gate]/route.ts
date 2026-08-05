import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  resetGateContent,
  saveGateContentOverride,
} from "@/lib/server/energetic-decoder-gate-content-service";

function parseGate(raw: string): number | null {
  const gate = Number(raw);
  return Number.isInteger(gate) && gate >= 1 && gate <= 64 ? gate : null;
}

/** Save (or overwrite) a practitioner's own rewrite of one gate's interpretive text. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; gate: string }> },
) {
  const { id: subAccountId, gate: gateParam } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const gate = parseGate(gateParam);
  if (!gate) {
    return NextResponse.json({ error: "Invalid gate number" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    showsUp?: string;
    giftText?: string;
  };
  const showsUp = (body.showsUp ?? "").trim();
  const giftText = (body.giftText ?? "").trim();
  if (!showsUp || !giftText) {
    return NextResponse.json(
      { error: "Both fields are required." },
      { status: 400 },
    );
  }

  await saveGateContentOverride(subAccountId, gate, { showsUp, giftText });
  return NextResponse.json({ ok: true });
}

/** Reset one gate back to the shipped default. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; gate: string }> },
) {
  const { id: subAccountId, gate: gateParam } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const gate = parseGate(gateParam);
  if (!gate) {
    return NextResponse.json({ error: "Invalid gate number" }, { status: 400 });
  }

  await resetGateContent(subAccountId, gate);
  return NextResponse.json({ ok: true });
}
