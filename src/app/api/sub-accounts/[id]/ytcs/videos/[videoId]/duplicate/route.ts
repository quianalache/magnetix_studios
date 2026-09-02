import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { duplicateVideoProject } from "@/lib/server/ytcs-service";

/** POST /api/sub-accounts/[id]/ytcs/videos/[videoId]/duplicate — see
 *  `duplicateVideoProject`'s doc comment for the disclosed duplication
 *  semantics (Video Library action). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; videoId: string }> },
) {
  const { id: subAccountId, videoId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const project = await duplicateVideoProject(subAccountId, videoId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, project });
}
