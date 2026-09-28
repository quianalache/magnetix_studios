import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";

/**
 * Names of the sub-account's active team members, for task assignee
 * pickers and the "Assigned to" column (Projects & Tasks Phase 2). Any
 * member may read it — the membership rows themselves stay admin-only in
 * firestore.rules, so only uid + display name leave the server.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/subAccountMembers`)
    .get();
  return NextResponse.json({
    assignees: snap.docs
      .filter((d) => d.data().status !== "removed")
      .map((d) => ({
        uid: d.id,
        name:
          (d.data().displayName as string) ||
          (d.data().email as string) ||
          "Team member",
      })),
    viewerUid: access.uid,
  });
}
