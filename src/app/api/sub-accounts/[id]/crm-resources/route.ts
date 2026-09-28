import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listCrmResources } from "@/lib/server/assets/crm-resources-service";

/** CRM Resources: read-only references to records owned by other modules (no copies). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  return NextResponse.json(await listCrmResources(subAccountId));
}
