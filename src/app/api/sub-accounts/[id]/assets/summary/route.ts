import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { listCrmResources } from "@/lib/server/assets/crm-resources-service";

/** Real counts for the Resource Library tiles (resources, CRM resources, media files, affiliate programs). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const db = getAdminDb();
  const [resources, affiliates, media, crm] = await Promise.all([
    db.collection("assets").where("subAccountId", "==", subAccountId).count().get(),
    db.collection("affiliateLinks").where("subAccountId", "==", subAccountId).count().get(),
    db.collection(`subAccounts/${subAccountId}/mediaAssets`).get(),
    listCrmResources(subAccountId),
  ]);
  const mediaFiles = media.docs.filter((d) => {
    if (d.id === "__usage") return false;
    const x = d.data();
    return x.subAccountId === subAccountId && x.status !== "deleted" && !x.deletedAt;
  }).length;
  return NextResponse.json({
    resources: resources.data().count,
    affiliatePrograms: affiliates.data().count,
    mediaFiles,
    crmResources: crm.items.length,
  });
}
