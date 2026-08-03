import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import { getFirstAgencyId } from "@/lib/pwa/icons-server";
import { validateLogoPng } from "@/lib/brand/logo-server";

/**
 * Custom brand-logo upload — agency-owner-only, mirrors
 * api/agency/app-icon/route.ts's shape. The browser resizes client-side
 * (lib/brand/render-logo-client.ts) and POSTs base64 PNG; the server
 * re-validates, stores it at agencies/{id}/brandAssets/logo, and points
 * `agency.logoUrl` at the public serving route in api/agency/logo/image —
 * the sidebar/landing page already read that field for a manually-pasted
 * URL, so this is a drop-in replacement, not a new consumer to wire up.
 */

export async function POST(request: Request) {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;

  const agencyId = await getFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json(
      { error: "No agency exists yet — complete first signup first." },
      { status: 409 },
    );
  }

  let body: { image?: unknown };
  try {
    body = (await request.json()) as { image?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = validateLogoPng(body.image);
  if (typeof result === "string") {
    return NextResponse.json({ error: result }, { status: 400 });
  }

  const db = getAdminDb();
  const version = Date.now();
  await db.doc(`agencies/${agencyId}/brandAssets/logo`).set({
    agencyId,
    png: result.toString("base64"),
    bytes: result.length,
    updatedAt: FieldValue.serverTimestamp(),
  });
  const logoUrl = `/api/agency/logo/image?v=${version}`;
  await db.doc(`agencies/${agencyId}`).update({ logoUrl });

  return NextResponse.json({ ok: true, logoUrl });
}

export async function DELETE(request: Request) {
  const owner = await requireAgencyOwner(request);
  if (owner instanceof NextResponse) return owner;

  const agencyId = await getFirstAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: true });
  }

  const db = getAdminDb();
  await db.doc(`agencies/${agencyId}/brandAssets/logo`).delete();
  await db.doc(`agencies/${agencyId}`).update({ logoUrl: FieldValue.delete() });

  return NextResponse.json({ ok: true });
}
