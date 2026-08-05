import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { EnergeticDecoderReportConfig } from "@/types/energetic-decoder";

/** Which Gene Keys sequences a reading includes — same merge-onto-subAccount-doc pattern as theme/route.ts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => ({}))) as Partial<EnergeticDecoderReportConfig>;
  const config: EnergeticDecoderReportConfig = {
    includeActivation: body.includeActivation !== false,
    includeVenus: body.includeVenus !== false,
    includePearl: body.includePearl !== false,
  };

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { energeticDecoderReportConfig: config, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true, config });
}
