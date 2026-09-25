import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAccessCatalog } from "@/lib/server/contact-access-service";

export const dynamic = "force-dynamic";

/**
 * The sub-account's offers, standalone courses and (sub-account-owned)
 * communities — for the Contacts "has access to" filter and the Contact
 * profile's Grant access dialog. Each item says whether complimentary
 * access can be granted from Contacts and, if not, why.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  return NextResponse.json(await getAccessCatalog(subAccountId));
}
