import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import type { LeadForm } from "@/types/forms";

/**
 * POC-only, read-only form resolver for the isolated Puck prototype
 * (src/app/docs/design-prototypes/puck-poc). Mirrors the exact pattern
 * /p/[pageId] already uses for safe public form resolution — Admin SDK,
 * bypassing Firestore rules the same way /f/[formId] does, since
 * /forms/{formId}'s rule has no public-read exception and this prototype
 * route (like the editor's own client-side fetch would be) is otherwise
 * unauthenticated. GET-only, no writes, not linked from any production
 * route or nav.
 */
export async function GET(req: Request) {
  const formId = new URL(req.url).searchParams.get("formId");
  if (!formId) return NextResponse.json(null, { status: 400 });

  const db = getAdminDb();
  const snap = await db.collection("forms").doc(formId).get();
  if (!snap.exists) return NextResponse.json(null, { status: 404 });

  const data = snap.data() as Omit<LeadForm, "id">;
  const form: LeadForm = { id: snap.id, ...data, createdAt: null, updatedAt: null };
  return NextResponse.json(form);
}
