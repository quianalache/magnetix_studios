import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import type { EnergeticDecoderTheme } from "@/types/energetic-decoder";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Chart/report branding — accent color + logo. Same merge-onto-subAccount-doc pattern as paypal-integration/route.ts. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Partial<EnergeticDecoderTheme>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accent = body.accent ?? "#7c3aed";
  if (!HEX_RE.test(accent)) {
    return NextResponse.json({ error: "Accent must be a hex color like #7c3aed." }, { status: 400 });
  }

  const theme: EnergeticDecoderTheme = {
    accent,
    logoUrl: body.logoUrl?.trim() || null,
  };

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}`)
    .set(
      { energeticDecoderTheme: theme, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

  return NextResponse.json({ ok: true, theme });
}
