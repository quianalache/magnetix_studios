import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { defaultEnergeticDecoderReportConfig, type EnergeticDecoderReportConfig } from "@/types/energetic-decoder";
import { isAstrologyHouseSystem } from "@/lib/energetics/reading-calculation-settings";
import { getAstrologyHouseSystem } from "@/lib/server/reading-calculation-settings-service";

/**
 * Reading Configuration — what gets calculated into a NEW reading. Same
 * merge-onto-subAccount-doc pattern as theme/route.ts. Holds the reading
 * calculation settings (sequences/systems included, and the Astrology
 * house system), which are deliberately separate from Chart Designs.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const saved = (await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data()?.energeticDecoderReportConfig ?? null;
  const config = { ...defaultEnergeticDecoderReportConfig(), ...(saved ?? {}) };
  const { houseSystem, source } = await getAstrologyHouseSystem(subAccountId, saved);
  return NextResponse.json({ ok: true, config, astrologyHouseSystem: houseSystem, astrologyHouseSystemSource: source });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => ({}))) as Partial<EnergeticDecoderReportConfig>;
  if (body.astrologyHouseSystem !== undefined && !isAstrologyHouseSystem(body.astrologyHouseSystem)) {
    return NextResponse.json({ error: "House system must be placidus, whole or equal." }, { status: 400 });
  }
  const config: EnergeticDecoderReportConfig = {
    includeActivation: body.includeActivation !== false,
    includeVenus: body.includeVenus !== false,
    includePearl: body.includePearl !== false,
    includeHumanDesign: body.includeHumanDesign !== false,
    includeAstrology: body.includeAstrology !== false,
    // Only written when sent — a request that doesn't mention it leaves the
    // saved house system exactly as it is (merge write).
    ...(body.astrologyHouseSystem !== undefined ? { astrologyHouseSystem: body.astrologyHouseSystem } : {}),
  };

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { energeticDecoderReportConfig: config, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true, config });
}
