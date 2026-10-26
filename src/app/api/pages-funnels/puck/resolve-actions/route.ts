import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { resolveActionTargets } from "@/lib/server/page-action-targets";

/**
 * GET ?subAccountId=…&pages=a,b&offers=c — resolves Button/Image "Go to
 * Page" / "Go to Offer" targets for the New Builder's client-side Preview
 * (published pages resolve on the server instead). Members only; targets
 * resolve only inside that sub-account (resolveActionTargets enforces it).
 * Static path, so it adds nothing to the Vercel route count.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const subAccountId = url.searchParams.get("subAccountId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(subAccountId)) {
    return NextResponse.json({ error: "Missing subAccountId" }, { status: 400 });
  }
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const list = (key: string) => (url.searchParams.get(key) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const resolved = await resolveActionTargets(subAccountId, { pageIds: list("pages"), offerIds: list("offers") });
  return NextResponse.json({ pages: resolved.pages, offers: resolved.offers });
}
