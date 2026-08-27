import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { updateContactServerSide } from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";

export const dynamic = "force-dynamic";

interface MarketingEmailBody {
  action?: "unsubscribe" | "resubscribe";
}

/**
 * Staff marketing-email control (2026-08-28) — the Contact detail page's
 * "Email Marketing" section. Deliberately a dedicated action route, not a
 * generic field on the PATCH endpoint's allowlist: this needs its own
 * guard (deliverability suppression) and its own truthful source-stamping
 * that a plain field patch shouldn't silently allow.
 *
 * `unsubscribe`: sets emailOptedOut:true + emailConsent.status:"unsubscribed",
 * source "manual_staff". Always allowed.
 *
 * `resubscribe`: sets emailOptedOut:false + emailConsent.status:"consented",
 * source "manual_staff" — NEVER "form", since staff clicking a button is
 * not the recipient's own explicit consent. Refused (409) when the contact
 * is deliverabilitySuppressed (hard bounce / spam complaint / invalid
 * address) — that flag is completely independent of marketing consent and
 * this action must never be able to clear it or paper over it. Broadcast
 * and Workflow Send Email both gate ONLY on emailOptedOut today (neither
 * checks deliverabilitySuppressed directly), so silently resubscribing a
 * suppressed contact would make them send-eligible again — exactly what
 * this guard exists to prevent.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const db = getAdminDb();
  const snap = await db.doc(`contacts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const contact = { id: snap.id, ...(snap.data() as Omit<Contact, "id">) };

  const access = await requireSubAccountMember(request, contact.subAccountId);
  if (access instanceof NextResponse) return access;

  let body: MarketingEmailBody;
  try {
    body = (await request.json()) as MarketingEmailBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "unsubscribe" && body.action !== "resubscribe") {
    return NextResponse.json(
      { error: "action must be 'unsubscribe' or 'resubscribe'" },
      { status: 400 },
    );
  }

  if (body.action === "resubscribe" && contact.deliverabilitySuppressed) {
    return NextResponse.json(
      {
        error:
          "This contact's address is deliverability-suppressed (hard bounce or spam complaint) and can't be resubscribed to marketing email. This is separate from marketing consent and isn't cleared here.",
      },
      { status: 409 },
    );
  }

  const patch =
    body.action === "resubscribe"
      ? {
          emailOptedOut: false,
          emailConsent: {
            status: "consented" as const,
            consentedAt: FieldValue.serverTimestamp(),
            unsubscribedAt: null,
            source: "manual_staff",
            sourceUrl: null,
            textShown: null,
            ip: null,
          },
        }
      : {
          emailOptedOut: true,
          emailConsent: {
            status: "unsubscribed" as const,
            consentedAt: null,
            unsubscribedAt: FieldValue.serverTimestamp(),
            source: "manual_staff",
            sourceUrl: null,
            textShown: null,
            ip: null,
          },
        };

  const result = await updateContactServerSide({
    contactId: id,
    patch,
    mode: (contact as unknown as { mode?: "live" | "test" }).mode ?? "live",
  });
  if (!result) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, contact: result.contact });
}
