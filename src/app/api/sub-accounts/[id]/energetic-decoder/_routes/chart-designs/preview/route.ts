import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { calculateHumanDesignProfile } from "@/lib/energetics/human-design";
import { calculateAstrologyChart } from "@/lib/energetics/astrology";

/**
 * A single fixed sample chart, real (not fabricated) — computed by this
 * app's own free local engine, the same one every actual reading runs
 * through — for the Chart Designs tab's live color previews (2026-08-09
 * rebuild). Not per-reading, not per-sub-account: one shared demo birth so
 * every design card previews against identical geometry and only the
 * colors differ, matching bodygraph.com's own Chart Design tool (its
 * preview panel is likewise one fixed sample chart, not a real client's).
 *
 * No Variables/Chiron/Bodygraph SVG here on purpose — those need the paid
 * API per real reading and would make a UI preview endpoint fire billed
 * calls every time an admin opens this tab. The 3 local chart components
 * (HumanDesignChart/AstrologyWheelChart/MandalaChart) never touch those
 * fields anyway, so the preview is complete for what it's actually for.
 */
const SAMPLE_BIRTH = {
  date: "1990-06-15",
  time: "12:00",
  timeZone: "America/New_York",
  lat: 40.7128,
  lng: -74.006,
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const humanDesign = calculateHumanDesignProfile(SAMPLE_BIRTH);
  const astrology = calculateAstrologyChart({ ...SAMPLE_BIRTH, houseSystem: "placidus" });

  return NextResponse.json({ ok: true, humanDesign, astrology });
}
