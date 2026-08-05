import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { refreshCustomDomainStatus } from "@/lib/domains/custom-domain-service";
import { getAdminDb } from "@/lib/firebase/admin";
import type { SubAccountDoc } from "@/types/tenancy";

/**
 * Trigger a live re-check of the custom domain's DNS/verification status
 * with Vercel and sync the result onto `customDomain`. Mirrors
 * `/resend/verify` — DNS propagation is asynchronous, so "still pending"
 * right after clicking is expected and the operator may need to retry.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subData = (await getAdminDb().doc(`subAccounts/${subAccountId}`).get()).data() as
    | Partial<SubAccountDoc>
    | undefined;
  if (subData?.customDomainEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The custom domain feature is disabled for this sub-account. Ask your agency owner to enable it.",
      },
      { status: 403 },
    );
  }
  if (!subData?.customDomain?.domain) {
    return NextResponse.json({ error: "Add a domain before verifying." }, { status: 400 });
  }

  try {
    const record = await refreshCustomDomainStatus(subAccountId);
    return NextResponse.json({ ok: true, customDomain: record });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Verification check failed." },
      { status: 502 },
    );
  }
}
