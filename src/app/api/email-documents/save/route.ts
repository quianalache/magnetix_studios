import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { validateEmailDocument } from "@/lib/email/validate";
import type { EmailDocument, EmailDocumentRef } from "@/types/email-document";

export const dynamic = "force-dynamic";

interface SaveBody {
  id?: string;
  subAccountId?: string;
  document?: EmailDocument;
}

/**
 * Create-or-update an `emailDocuments/{id}` doc — the Phase-1 EmailDocumentRef
 * storage abstraction, first put to real use here (Shared Email Foundation
 * Phase 3, 2026-09-09). `id` is client-generated (crypto.randomUUID(), same
 * pattern as Broadcast's draftId) so a Workflow Send Email step's config can
 * hold a stable `emailDocumentId` reference from the moment it's first
 * created, mirroring how Broadcast drafts avoid ever needing to rename an
 * id-scoped resource.
 *
 * This exists specifically to keep a WorkflowDoc's node tree small: the full
 * designed email (which can include several image/video blocks) lives in its
 * own document instead of inline in every node's config, so a workflow with
 * many Send Email steps can't approach Firestore's 1MiB document limit.
 */
export async function POST(request: Request) {
  let payload: SaveBody;
  try {
    payload = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = payload.id?.trim();
  const subAccountId = payload.subAccountId?.trim();
  const document = payload.document;

  if (!id || !subAccountId || !document) {
    return NextResponse.json(
      { error: "id, subAccountId, and document are required" },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const errors = validateEmailDocument(document, { requireSubject: false });
  if (errors.length) {
    return NextResponse.json(
      { error: "Invalid email document", details: errors },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const ref = db.collection("emailDocuments").doc(id);
  const snap = await ref.get();
  if (snap.exists) {
    const existing = snap.data() as EmailDocumentRef;
    if (existing.subAccountId !== subAccountId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await ref.update({
      document,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, created: false });
  }

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const agencyId = subSnap.data()?.agencyId as string;
  const doc: Omit<EmailDocumentRef, "id"> = {
    agencyId,
    subAccountId,
    document,
    createdAt: FieldValue.serverTimestamp() as unknown as null,
    updatedAt: FieldValue.serverTimestamp() as unknown as null,
  };
  await ref.set({ id, ...doc });
  return NextResponse.json({ ok: true, created: true });
}
