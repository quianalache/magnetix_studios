import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";

/** A user-facing checkout error with an HTTP status and optional field errors. */
export class CheckoutError extends Error {
  constructor(
    message: string,
    public status = 400,
    public fields: Record<string, string> | null = null,
    public code: string | null = null,
  ) {
    super(message);
  }
}

export function checkoutErrorResponse(err: unknown): NextResponse {
  if (err instanceof CheckoutError) {
    return NextResponse.json({ error: err.message, fields: err.fields ?? undefined, code: err.code ?? undefined }, { status: err.status });
  }
  console.error("[checkout] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CheckoutError("Send a JSON object.");
  return body as Record<string, unknown>;
}

export const newId = () => getAdminDb().collection("_ids").doc().id;

export async function agencyIdFor(subAccountId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) throw new CheckoutError("Workspace not found.", 404);
  return (snap.data()?.agencyId as string) ?? "";
}

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export function assertId(v: unknown, label = "id"): string {
  if (typeof v !== "string" || !ID_RE.test(v)) throw new CheckoutError(`Invalid ${label}.`, 404);
  return v;
}

/**
 * Per-IP cap on the public checkout-START calls (Step 1 Continue, one-step
 * email capture). They create a Contact, so they're limited like a signup —
 * on their own counter, so a real buyer's later payment is never blocked.
 */
export function checkoutStartRateLimited(request: Request, bucket: "start" | "resume" = "start"): NextResponse | null {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const ok = checkMemberAuthRateLimit({ key: `checkout-${bucket}-ip:${ip}`, limit: 30, windowMs: 10 * 60 * 1000 });
  return ok ? null : NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
}
