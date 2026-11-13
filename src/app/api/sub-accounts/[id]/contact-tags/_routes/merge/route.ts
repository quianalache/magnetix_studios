import "server-only";

import { NextResponse } from "next/server";
import { mergeTags } from "@/lib/server/contact-tags/service";
import { readJsonBody, tagErrorResponse, tagRouteAccess } from "@/lib/server/contact-tags/route-helpers";

export const dynamic = "force-dynamic";

/** Merge: `{ targetId, sourceIds }` (admins). The creator chooses the tag to keep. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await tagRouteAccess(request, subAccountId, { manage: true });
  if (access instanceof NextResponse) return access;
  const body = await readJsonBody(request);
  if (!body || typeof body.targetId !== "string" || !Array.isArray(body.sourceIds)) {
    return NextResponse.json({ error: "Choose the tag to keep and the tags to merge into it." }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await mergeTags({
        subAccountId,
        agencyId: access.agencyId,
        targetId: body.targetId,
        sourceIds: body.sourceIds.filter((s): s is string => typeof s === "string").slice(0, 50),
        uid: access.uid,
      }),
    );
  } catch (err) {
    return tagErrorResponse(err);
  }
}
