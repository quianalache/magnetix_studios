import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteEmbedConfig,
  EmbedError,
  getEmbedConfig,
  listEmbedPlacements,
  listEmbedTestRecords,
  listReadingResultPages,
  updateEmbedConfig,
} from "@/lib/server/embed-config-service";
import { listContentSets } from "@/lib/server/content-set-service";
import { listChartDesignSets } from "@/lib/server/chart-design-set-service";
import { listStandaloneCourses } from "@/lib/server/standalone-course-service";
import { listCourseOffers } from "@/lib/server/course-offer-service";
import { loadReadingSystems } from "@/lib/server/energetic-decoder-service";
import { resolveReadingToolPayload } from "@/lib/server/reading-tool-payload";

type Ctx = { params: Promise<{ id: string; embedId: string }> };

/** One Embed for the editor, with everything its selectors offer. */
export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  // `?view=tool` — what the Pages & Funnels editor/preview renders.
  if (new URL(request.url).searchParams.get("view") === "tool") {
    const payload = await resolveReadingToolPayload(subAccountId, embedId, { staff: true });
    if (!payload) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, payload });
  }

  const embed = await getEmbedConfig(subAccountId, embedId);
  if (!embed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [placements, test, contentSets, chartSets, courses, offers, systems, resultPages] = await Promise.all([
    listEmbedPlacements(subAccountId),
    listEmbedTestRecords(subAccountId, embedId),
    listContentSets(subAccountId),
    listChartDesignSets(subAccountId, access.agencyId ?? embed.agencyId),
    listStandaloneCourses(subAccountId).catch(() => []),
    listCourseOffers(subAccountId).catch(() => []),
    loadReadingSystems(subAccountId),
    listReadingResultPages(subAccountId),
  ]);

  return NextResponse.json({
    ok: true,
    embed: { ...embed, placements: placements.get(embedId) ?? [] },
    testRecords: test.readingIds.length,
    options: {
      contentSets: contentSets.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault })),
      chartDesigns: chartSets.sets.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault })),
      courses: courses.map((c) => ({ id: c.id, title: c.title, published: !!c.published })),
      offers: offers.map((o) => ({ id: o.id, title: o.title, published: o.visibility === "published" })),
      resultPages,
      systems: "error" in systems
        ? { humanDesign: false, astrology: false }
        : { humanDesign: !!systems.reportConfig.includeHumanDesign, astrology: !!systems.reportConfig.includeAstrology },
    },
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const embed = await updateEmbedConfig(subAccountId, embedId, body);
    return NextResponse.json({ ok: true, embed });
  } catch (err) {
    if (err instanceof EmbedError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, embedId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await deleteEmbedConfig(subAccountId, embedId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EmbedError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
