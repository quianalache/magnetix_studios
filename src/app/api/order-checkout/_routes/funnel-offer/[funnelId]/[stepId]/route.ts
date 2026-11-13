import "server-only";

import { NextResponse } from "next/server";
import { CheckoutError, checkoutErrorResponse, ID_RE, readBody } from "@/lib/server/checkout/common";
import { funnelOfferAction, funnelSessionCookieName, type FunnelOfferAction } from "@/lib/server/checkout/funnel-runtime-service";

export const dynamic = "force-dynamic";

const ACTIONS = new Set<FunnelOfferAction>(["accept", "decline", "status"]);

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * Public: Accept / Decline / status for an Upsell / Downsell step in the
 * buyer's funnel session. Authorized ONLY by the httpOnly funnel-session
 * cookie (set when their funnel Checkout was paid); `SameSite=Lax` + a JSON
 * body keep cross-site posts out. The body is `{ action, consent? }` — no
 * Offer, price or amount is ever read from it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ funnelId: string; stepId: string }> }) {
  const { funnelId, stepId } = await ctx.params;
  try {
    if (!ID_RE.test(funnelId) || !ID_RE.test(stepId)) throw new CheckoutError("This offer isn't available.", 404);
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new CheckoutError("Send a JSON object.", 415);
    const body = await readBody(request);
    const action = body.action as FunnelOfferAction;
    if (!ACTIONS.has(action)) throw new CheckoutError("Unknown action.", 400);
    const token = cookieValue(request.headers.get("cookie"), funnelSessionCookieName(funnelId));
    const result = await funnelOfferAction({ funnelId, stepId, action, token, consent: body.consent });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return checkoutErrorResponse(err);
  }
}
