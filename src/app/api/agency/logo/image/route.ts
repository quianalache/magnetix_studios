import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { getFirstAgencyId } from "@/lib/pwa/icons-server";

/**
 * Public logo-serving route — what `agency.logoUrl` points at after an
 * upload. Public path (middleware): the landing page and its logo render
 * for anonymous visitors, same reasoning as api/pwa/icon/[variant].
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const agencyId = await getFirstAgencyId();
    if (!agencyId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const snap = await getAdminDb()
      .doc(`agencies/${agencyId}/brandAssets/logo`)
      .get();
    const png = snap.data()?.png as string | undefined;
    if (!png) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(Buffer.from(png, "base64"), {
      headers: {
        "Content-Type": "image/png",
        // The URL carries ?v=<upload millis>, so long cache is safe.
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
