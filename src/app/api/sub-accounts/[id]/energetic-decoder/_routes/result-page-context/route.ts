import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { buildSampleReading } from "@/lib/server/reading-samples";
import { buildReadingBlockContext } from "@/lib/server/reading-block-context";
import { READING_SAMPLE_KINDS, type ReadingResultPageSettings, type ReadingSampleKind } from "@/types/reading-blocks";

/**
 * GET ?pageId=…&sample=projector|…|latestTest&offers=id,id&chartDesignSetId=…
 *
 * The Reading context the New Builder shows on a Reading Result Page
 * (2026-10-21) — a fictional sample chart (or the staff member's latest
 * hidden Test Reading), the page's Chart Design, and any Featured Offers
 * placed on the canvas. Staff of this business only; never creates or
 * changes anything. `chartDesignSetId` lets the builder preview an unsaved
 * page-settings change ("" = inherit).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const pageId = url.searchParams.get("pageId") ?? "";
  const page = /^[A-Za-z0-9_-]{1,64}$/.test(pageId) ? await getAdminDb().collection("pages").doc(pageId).get() : null;
  if (!page?.exists || page.get("subAccountId") !== subAccountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stored = (page.get("readingResult") ?? {}) as Partial<ReadingResultPageSettings>;
  const requested = url.searchParams.get("sample") as ReadingSampleKind | null;
  const sample: ReadingSampleKind = requested && READING_SAMPLE_KINDS.includes(requested) ? requested : stored.sample ?? "projector";
  const designParam = url.searchParams.get("chartDesignSetId");
  const chartDesignSetId = designParam === null ? stored.chartDesignSetId ?? null : designParam || null;
  const offerIds = (url.searchParams.get("offers") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)).slice(0, 20);

  let reading = await buildSampleReading(subAccountId, sample);
  let usedSample = sample;
  if (!reading && sample === "latestTest") {
    // No Test Reading yet — fall back to a sample so the canvas isn't empty.
    reading = await buildSampleReading(subAccountId, "projector");
    usedSample = "projector";
  }
  if (!reading) {
    return NextResponse.json({ error: "Turn on Human Design or Astrology in Reading Configuration to preview Reading blocks." }, { status: 422 });
  }
  const context = await buildReadingBlockContext({
    subAccountId,
    reading,
    mode: "sample",
    pageSettings: { chartDesignSetId, sample },
    offerIds,
    sample: usedSample,
  });
  return NextResponse.json({ ok: true, context, sample: usedSample, fellBack: usedSample !== sample });
}
