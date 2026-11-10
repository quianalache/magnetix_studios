import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { pageSubAccountId } from "@/lib/server/page-form-resolver";
import { checkoutContextsForPage, resolveCheckoutBlocks } from "@/lib/server/page-checkout-resolver";
import { AUTO_CHECKOUT_KEY, isCheckoutConfigId } from "@/lib/pages-funnels/checkout-block";

export const dynamic = "force-dynamic";

/**
 * Checkout block resolver for the builder canvas, its settings panel and
 * Preview (Checkout Foundation Phase 3). Same tenant model as
 * `resolve-booking`: the caller names the PAGE; the workspace is that page's
 * own `subAccountId`, read server-side, and the caller must be able to open
 * it. Only that workspace's Funnel Checkout Steps are listed or resolved —
 * a foreign config id comes back `null`. The view is the editor-safe
 * preview (drafts allowed, never payable).
 */
const notFound = () => NextResponse.json(null, { status: 404 });

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const pageId = params.get("pageId");
  if (!pageId || !/^[A-Za-z0-9_-]{1,64}$/.test(pageId)) return notFound();
  const keys = (params.get("keys") ?? "")
    .split(",")
    .filter((k) => k === AUTO_CHECKOUT_KEY || isCheckoutConfigId(k))
    .slice(0, 5);

  const subAccountId = await pageSubAccountId(pageId);
  if (!subAccountId) return notFound();
  const access = await requireSubAccountMember(req, subAccountId);
  if (access instanceof NextResponse) return notFound();

  const page = { id: pageId, subAccountId };
  const [contexts, resolved] = await Promise.all([checkoutContextsForPage(subAccountId, pageId), resolveCheckoutBlocks(page, keys, "editor")]);
  return NextResponse.json({ subAccountId, ...contexts, resolved });
}
