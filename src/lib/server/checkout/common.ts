import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

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
