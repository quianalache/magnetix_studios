import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireContactRoute } from "@/lib/server/contact-route-guard";
import type { FormSubmissionAnswer } from "@/types/forms";
import type { ContactSubmissionView } from "@/types/contact-feed";

export const dynamic = "force-dynamic";

const MAX_SUBMISSIONS = 100;

/**
 * Submitted Forms for one contact (Contacts redesign, 2026-09-25).
 *
 * Replaces the profile card's CLIENT collection-group query on
 * `submissions`, which the security rules never authorized (there is no
 * `/{path=**}/submissions` rule, and submission docs carry no tenancy
 * fields for one to check), so it failed with permission-denied and the
 * card sat on its loading skeleton forever.
 *
 * Here: auth + territory via the contact, then an Admin-SDK collection-group
 * query on `contactId` (composite index `submissions(contactId, createdAt
 * desc)` already exists), then EVERY submission is re-checked against its
 * parent form's `subAccountId` before it's returned. Rules are unchanged.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireContactRoute(request, id);
  if (guard instanceof NextResponse) return guard;

  const db = getAdminDb();
  const snap = await db
    .collectionGroup("submissions")
    .where("contactId", "==", id)
    .orderBy("createdAt", "desc")
    .limit(MAX_SUBMISSIONS + 1)
    .get();

  // Only docs that really live at forms/{formId}/submissions/{id}.
  const candidates = snap.docs.filter((d) => {
    const parts = d.ref.path.split("/");
    return parts.length === 4 && parts[0] === "forms" && parts[2] === "submissions";
  });
  const formIds = [...new Set(candidates.map((d) => d.ref.path.split("/")[1]))];
  const formSnaps = formIds.length
    ? await db.getAll(...formIds.map((f) => db.doc(`forms/${f}`)))
    : [];
  const formById = new Map(
    formSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() ?? {}]),
  );

  const submissions: ContactSubmissionView[] = [];
  for (const d of candidates.slice(0, MAX_SUBMISSIONS)) {
    const formId = d.ref.path.split("/")[1];
    const form = formById.get(formId);
    // Tenancy re-check: the parent form must belong to the contact's
    // sub-account. A deleted form's submissions are dropped too (no owner
    // to verify against).
    if (!form || form.subAccountId !== guard.contact.subAccountId) continue;
    const data = d.data();
    const answers = Array.isArray(data.answers)
      ? (data.answers as FormSubmissionAnswer[])
      : null;
    const values = (data.values ?? {}) as Record<string, string>;
    const createdAt = data.createdAt as { toDate?: () => Date } | null;
    submissions.push({
      id: d.id,
      formId,
      formName: (data.formName as string) || (form.name as string) || "Form",
      createdAt:
        createdAt && typeof createdAt.toDate === "function"
          ? createdAt.toDate().toISOString()
          : null,
      answers:
        answers ??
        Object.entries(values).map(([fieldId, value]) => ({
          fieldId,
          label: fieldId,
          value: String(value ?? ""),
        })),
      legacy: !answers,
    });
  }

  return NextResponse.json({
    submissions,
    truncated: candidates.length > MAX_SUBMISSIONS,
  });
}
