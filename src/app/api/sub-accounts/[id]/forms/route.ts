import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/** Tenant-scoped form catalog used by Contact List segmentation. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  const snap = await getAdminDb().collection("forms").where("subAccountId", "==", id).select("name").get();
  return NextResponse.json({ forms: snap.docs.map((doc) => ({ id: doc.id, name: String(doc.get("name") ?? "Untitled form") })).sort((a, b) => a.name.localeCompare(b.name)) });
}
