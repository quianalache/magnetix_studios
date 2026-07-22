import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  DEAL_NAME_MAX,
  DEAL_MEMBER_NOUN_MAX,
  DEAL_SEATS_MIN,
  DEAL_SEATS_MAX,
  DEAL_OFFER_LABEL_MAX,
} from "@/lib/deal-config";

/**
 * Agency-owner-only editor for the live deal campaign (name, urgency type,
 * member noun, seat count, countdown deadline + offer label). Writes onto
 * the EXISTING `appConfig/foundersCohort` doc —
 * publicly readable by the unauthenticated landing page via
 * `useFoundersCohort` — through the Admin SDK (bypasses the
 * `allow write: if false` rule). Mirrors the updates-modal-config route.
 *
 * Deliberately never touches `soldCount` / `currentWave` — those belong to
 * the Stripe webhook. Reset them in the Firebase console when starting a
 * fresh campaign.
 */

const DOC_PATH = "appConfig/foundersCohort";

interface PatchBody {
  dealName?: string;
  dealType?: string;
  memberNoun?: string;
  slotsTotal?: number;
  /** ISO-8601 datetime for the countdown deadline, or null to clear it. */
  dealEndsAt?: string | null;
  offerLabel?: string;
  fullPriceAfterEnd?: boolean;
}

export async function PATCH(request: Request) {
  const auth = await requireAgencyOwner(request);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: auth.uid,
  };

  if (body.dealName !== undefined) {
    const dealName =
      typeof body.dealName === "string" ? body.dealName.trim() : "";
    if (!dealName || dealName.length > DEAL_NAME_MAX) {
      return NextResponse.json(
        { error: `\`dealName\` must be 1–${DEAL_NAME_MAX} characters.` },
        { status: 400 },
      );
    }
    updates.dealName = dealName;
  }

  if (body.memberNoun !== undefined) {
    const memberNoun =
      typeof body.memberNoun === "string" ? body.memberNoun.trim() : "";
    if (!memberNoun || memberNoun.length > DEAL_MEMBER_NOUN_MAX) {
      return NextResponse.json(
        {
          error: `\`memberNoun\` must be 1–${DEAL_MEMBER_NOUN_MAX} characters.`,
        },
        { status: 400 },
      );
    }
    updates.memberNoun = memberNoun;
  }

  if (body.dealType !== undefined) {
    if (body.dealType !== "spots" && body.dealType !== "countdown") {
      return NextResponse.json(
        { error: '`dealType` must be "spots" or "countdown".' },
        { status: 400 },
      );
    }
    updates.dealType = body.dealType;
  }

  if (body.dealEndsAt !== undefined) {
    if (body.dealEndsAt === null) {
      updates.dealEndsAt = null;
    } else {
      const ms =
        typeof body.dealEndsAt === "string" ? Date.parse(body.dealEndsAt) : NaN;
      if (!Number.isFinite(ms)) {
        return NextResponse.json(
          { error: "`dealEndsAt` must be an ISO-8601 datetime or null." },
          { status: 400 },
        );
      }
      // Stored as a normalized ISO string (not a Firestore Timestamp) so the
      // public landing's client SDK read needs no type juggling. A past date
      // is allowed — the landing hides the timer but keeps selling.
      updates.dealEndsAt = new Date(ms).toISOString();
    }
  }

  if (body.fullPriceAfterEnd !== undefined) {
    if (typeof body.fullPriceAfterEnd !== "boolean") {
      return NextResponse.json(
        { error: "`fullPriceAfterEnd` must be a boolean." },
        { status: 400 },
      );
    }
    updates.fullPriceAfterEnd = body.fullPriceAfterEnd;
  }

  if (body.offerLabel !== undefined) {
    const offerLabel =
      typeof body.offerLabel === "string" ? body.offerLabel.trim() : "";
    if (!offerLabel || offerLabel.length > DEAL_OFFER_LABEL_MAX) {
      return NextResponse.json(
        {
          error: `\`offerLabel\` must be 1–${DEAL_OFFER_LABEL_MAX} characters.`,
        },
        { status: 400 },
      );
    }
    updates.offerLabel = offerLabel;
  }

  if (body.slotsTotal !== undefined) {
    const s = body.slotsTotal;
    if (
      typeof s !== "number" ||
      !Number.isInteger(s) ||
      s < DEAL_SEATS_MIN ||
      s > DEAL_SEATS_MAX
    ) {
      return NextResponse.json(
        {
          error: `\`slotsTotal\` must be a whole number between ${DEAL_SEATS_MIN} and ${DEAL_SEATS_MAX}.`,
        },
        { status: 400 },
      );
    }
    updates.slotsTotal = s;
  }

  // Require at least one real field beyond the two audit stamps.
  if (Object.keys(updates).length <= 2) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 },
    );
  }

  try {
    await getAdminDb().doc(DOC_PATH).set(updates, { merge: true });
  } catch (err) {
    console.error("[agency/deal-config] write failed", err);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
