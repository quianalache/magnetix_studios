import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";

export const dynamic = "force-dynamic";

/** Staff: create a course in a group's classroom. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  return NextResponse.json(
    { error: "Create a canonical Course first, then link it to this Community." },
    { status: 410 },
  );
}
