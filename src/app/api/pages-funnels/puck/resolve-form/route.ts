import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { LeadForm } from "@/types/forms";

/**
 * Production Puck Form-element resolver — the client/editor path only (see
 * master spec §11 / this repo's `form-client.tsx`). Mirrors the exact
 * pattern `/p/[pageId]` and `/f/[formId]` already use for safe public form
 * resolution: Admin SDK, bypassing Firestore rules the same intentional way
 * those two routes already do, because `/forms/{formId}`'s security rule
 * has no public-read exception (member-only) — a plain client-SDK read
 * would fail wherever the caller isn't an authenticated sub-account member
 * (this Phase 1 harness route included, since it lives under
 * docs/design-prototypes, unauthenticated, matching the POC's own
 * constraint). GET-only, read-only, no writes, no submission logic —
 * `PublicForm` remains the one real submission engine (master spec §9/§11).
 *
 * The server/public `<Render>` path does NOT use this route — it resolves
 * forms directly via the Admin SDK in the calling server component/route,
 * same as `/p/[pageId]`'s `SectionTreeView` caller, avoiding an unnecessary
 * internal HTTP round-trip. This route exists specifically for contexts
 * where a client component needs to fetch (the editor canvas, this
 * harness) — see `PuckPageMetadata.resolvedForms` (pages-funnels-puck.ts)
 * for the server-side equivalent.
 */
export async function GET(req: Request) {
  const formId = new URL(req.url).searchParams.get("formId");
  if (!formId) return NextResponse.json(null, { status: 400 });

  const db = getAdminDb();
  const snap = await db.collection("forms").doc(formId).get();
  if (!snap.exists) return NextResponse.json(null, { status: 404 });

  const data = snap.data() as Omit<LeadForm, "id">;
  const form: LeadForm = {
    id: snap.id,
    ...data,
    createdAt: null,
    updatedAt: null,
  };
  return NextResponse.json(form);
}
