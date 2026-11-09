import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { checkoutErrorResponse, readBody } from "@/lib/server/checkout/common";
import { checkoutEditorPayload, getHostedCheckoutConfig, saveHostedCheckoutConfig } from "@/lib/server/checkout/config-service";
import { listWorkspacePages } from "@/lib/server/checkout/pages";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; offerId: string }> };

/** The Offer's hosted (standalone) checkout settings. */
export async function GET(request: Request, ctx: Ctx) {
  const { id, offerId } = await ctx.params;
  const access = await requireSubAccountMember(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const { config, offer, saved } = await getHostedCheckoutConfig(id, offerId);
    const [payload, pages] = await Promise.all([checkoutEditorPayload(id, config), listWorkspacePages(id)]);
    return NextResponse.json({
      ...payload,
      saved,
      pages,
      offer: { id: offer.id, title: offer.title, slug: offer.slug, visibility: offer.visibility, systemManaged: offer.systemManaged === true, classicCollectAddress: offer.checkoutSettings?.collectAddress === true },
    });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id, offerId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  try {
    const config = await saveHostedCheckoutConfig({ subAccountId: id, offerId, uid: access.uid, body: await readBody(request) });
    return NextResponse.json({ ...(await checkoutEditorPayload(id, config)), saved: true });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
