import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { createEnergeticDecoderReading } from "@/lib/server/energetic-decoder-service";
import { notifyReadingReady } from "@/lib/server/notification-producers";
import type { EnergeticDecoderRequest } from "@/types/energetic-decoder";

export const dynamic = "force-dynamic";

/**
 * The public embeddable tool's submit endpoint — no session of any kind
 * (mirrors /api/offer/[saId]/[offerId]/signup). Same save path the
 * practitioner's own internal tool uses (createEnergeticDecoderReading),
 * so a visitor's reading shows up as a saved client chart + Contact just
 * like one the practitioner generates themselves.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists || subSnap.data()?.status === "archived") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const agencyId = subSnap.data()?.agencyId as string | undefined;
  if (!agencyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: EnergeticDecoderRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await createEnergeticDecoderReading({
    ...body,
    subAccountId: saId,
    agencyId,
    createdByUid: "energetic-decoder-public",
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  // Reading Ready loop (2026-08-26): reliably AWAITED, not void-fired —
  // same reliability class already fixed for every other notification
  // producer. Generation is synchronous (see notifyReadingReady's own doc
  // comment) — reaching here IS the real "ready" transition, exactly
  // once, for a brand-new reading id every call.
  await notifyReadingReady({
    subAccountId: saId,
    readingId: result.reading.id,
    contactId: result.contactId,
    hasGeneKeys: result.reading.spheres.length > 0,
    hasHumanDesign: !!result.reading.humanDesign,
    hasAstrology: !!result.reading.astrology,
  }).catch((err) => console.warn("[decoder/submit] notification failed", err));

  return NextResponse.json({ ok: true, reading: result.reading });
}
