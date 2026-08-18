import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { searchGroupMembersServerSide } from "@/lib/server/community-feed-service";

export const dynamic = "force-dynamic";

/** Member: search this group's own active members for the @ mention
 *  autocomplete in the post composer. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  // Deliberately does NOT exclude the viewer — unlike a DM ("message
  // yourself" is meaningless), mentioning yourself in a public post is
  // harmless and plausible (quoting/referring back to your own earlier
  // post), so there's no reason to special-case it out of the results.
  const members = await searchGroupMembersServerSide({
    subAccountId: saId,
    groupId,
    query: q,
  });
  return NextResponse.json({ members });
}
