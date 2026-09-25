import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ContactListError,
  createContactList,
  listContactLists,
  toContactListView,
} from "@/lib/server/contact-lists-service";

export const dynamic = "force-dynamic";

/**
 * Contact Lists (Contacts redesign, 2026-09-25).
 *   GET  — every list in the sub-account (any active member).
 *   POST — create `{ name, description?, group }` (any active member; the
 *          creator + admins can later edit/delete it).
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const isAdmin =
    access.subAccountRole === "admin" || access.subAccountRole === "agencyOwner";
  const lists = await listContactLists(subAccountId);
  return NextResponse.json({
    lists: lists.map((l) => toContactListView(l, { uid: access.uid, isAdmin })),
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";
  const isAdmin =
    access.subAccountRole === "admin" || access.subAccountRole === "agencyOwner";
  try {
    const list = await createContactList({
      subAccountId,
      agencyId,
      uid: access.uid,
      name: body.name,
      description: body.description,
      group: body.group,
    });
    return NextResponse.json(
      { list: toContactListView(list, { uid: access.uid, isAdmin }) },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ContactListError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
