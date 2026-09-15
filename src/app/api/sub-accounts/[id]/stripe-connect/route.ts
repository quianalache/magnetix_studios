import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { deauthorizeStripeConnect } from "@/lib/stripe/connect";
import {
  getStripeConnectionForEnvironment,
  getStripeEnvironment,
} from "@/lib/stripe/server";
import type { SubAccountDoc } from "@/types";

/** Disconnect a sub-account's Stripe Connect account. Admin-only. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}`);
  const snap = await ref.get();
  const sub = snap.data() as SubAccountDoc | undefined;
  const environment = getStripeEnvironment();
  const connection = getStripeConnectionForEnvironment(
    sub?.stripeConnect,
    environment
  );
  const accountId = connection?.accountId;

  if (accountId) {
    await deauthorizeStripeConnect(accountId, environment);
  }

  const hasExplicitEnvironmentConnection = !!sub?.stripeConnect?.[environment];
  await ref.set(
    hasExplicitEnvironmentConnection
      ? {
          [`stripeConnect.${environment}`]: null,
          updatedAt: FieldValue.serverTimestamp(),
        }
      : { stripeConnect: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  return NextResponse.json({ ok: true });
}
