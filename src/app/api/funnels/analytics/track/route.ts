import "server-only";

import { NextResponse } from "next/server";
import { publicFunnelStepForCheckoutConfig, publicFunnelStepForPage, recordFunnelAnalyticsEventSafe } from "@/lib/server/funnel-analytics-service";
import { recordPageView } from "@/lib/server/page-analytics-service";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { cookies } from "next/headers";
import { funnelSessionCookieName, verifyFunnelSessionToken } from "@/lib/server/checkout/funnel-runtime-service";

export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;
const noop = () => NextResponse.json({ ok: true });

export async function POST(request: Request) {
  // Public beacon: a light per-IP ceiling keeps casual inflation out without
  // affecting real visitors (a busy visitor makes a few views per minute).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  if (!checkMemberAuthRateLimit({ key: `analytics-beacon:${ip}`, limit: 120, windowMs: 60_000 })) return noop();
  let body: { pageId?: unknown; configId?: unknown; visitorId?: unknown; viewId?: unknown };
  try { body = await request.json(); } catch { return noop(); }
  const pageId = typeof body.pageId === "string" ? body.pageId : null;
  const configId = typeof body.configId === "string" ? body.configId : null;
  const visitorId = typeof body.visitorId === "string" && ID_RE.test(body.visitorId) ? body.visitorId : null;
  const viewId = typeof body.viewId === "string" && ID_RE.test(body.viewId) ? body.viewId : null;
  if ((!pageId && !configId) || !visitorId || !viewId) return noop();
  // Page analytics: every view of a published Pages & Funnels page (also
  // when the page is a funnel step — the funnel's step view below is a
  // separate metric). Best-effort: tracking never fails the visitor.
  if (pageId) {
    await recordPageView({ pageId, visitorId }).catch((err) => console.error("[page-analytics] view write failed", err instanceof Error ? err.message : err));
  }
  const context = pageId ? await publicFunnelStepForPage(pageId) : await publicFunnelStepForCheckoutConfig(configId!);
  if (!context) return noop();
  const { funnel, step } = context;
  const cookieStore = await cookies();
  const token = cookieStore.get(funnelSessionCookieName(funnel.id))?.value;
  const sessionId = verifyFunnelSessionToken(token);
  const first = step.order === 0;
  const common = { agencyId: funnel.agencyId, subAccountId: funnel.subAccountId, funnelId: funnel.id, stepId: step.id, pageId, funnelSessionId: sessionId, anonymousSessionId: visitorId, paymentMode: "unknown" as const, verified: false, anonymousUniqueKey: `${visitorId}:view:${step.id}`, };
  await recordFunnelAnalyticsEventSafe({ ...common, type: "step_viewed", idempotencyKey: `view:${viewId}` });
  if (step.type === "upsell" || step.type === "downsell") {
    await recordFunnelAnalyticsEventSafe({ ...common, type: "offer_viewed", idempotencyKey: `offer-view:${viewId}`, anonymousUniqueKey: `${visitorId}:offer:${step.id}` });
  } else if (first) {
    await recordFunnelAnalyticsEventSafe({ ...common, type: "funnel_entry", idempotencyKey: `entry:${visitorId}:${funnel.id}`, anonymousUniqueKey: `${visitorId}:entry:${funnel.id}` });
  }
  return noop();
}
