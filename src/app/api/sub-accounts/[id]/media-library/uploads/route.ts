import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { tenantOf } from "@/lib/server/assets/media-library-service";
import { createUploadIntake } from "@/lib/server/assets/media-upload-intake-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

export const dynamic = "force-dynamic";

/**
 * Start a direct-to-storage Media Library upload (sub-account admins).
 * Body `{filename, mimeType, sizeBytes, title?}` — validated here; returns
 * the one object key the browser may write. See media-upload-intake-service.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) as Record<string, unknown>) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const intake = await createUploadIntake(await tenantOf(subAccountId), access.uid, body);
    return NextResponse.json(intake, { status: 201 });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
