import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { tenantOf } from "@/lib/server/assets/media-library-service";
import { completeUploadIntake } from "@/lib/server/assets/media-upload-intake-service";
import { mediaErrorResponse } from "@/lib/server/assets/media-route-helpers";

export const dynamic = "force-dynamic";

/** Finish a direct upload: validate the stored object and create the Media Library file. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; intakeId: string }> }) {
  const { id: subAccountId, intakeId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    const item = await completeUploadIntake(await tenantOf(subAccountId), access.uid, intakeId);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return mediaErrorResponse(err);
  }
}
