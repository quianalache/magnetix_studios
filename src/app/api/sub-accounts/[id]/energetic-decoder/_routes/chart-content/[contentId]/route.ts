import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  resetChartContentOverride,
  saveChartContentOverride,
} from "@/lib/server/energetic-decoder-chart-content-service";

/** Save (or overwrite) a practitioner's own rewrite of one Human Design / Astrology content item — e.g. "hd:type:Generator", "astro:house:7". */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  const { id: subAccountId, contentId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(body)) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      return NextResponse.json({ error: "All fields are required." }, { status: 400 });
    }
    fields[key] = trimmed;
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  await saveChartContentOverride(subAccountId, contentId, fields);
  return NextResponse.json({ ok: true });
}

/** Reset one content item back to the shipped default. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  const { id: subAccountId, contentId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await resetChartContentOverride(subAccountId, contentId);
  return NextResponse.json({ ok: true });
}
