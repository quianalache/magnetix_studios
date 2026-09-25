import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  createContactServerSide,
  findExistingContactId,
} from "@/lib/server/contacts-service";
import { invalidateContactsCache } from "@/lib/server/contacts-query-service";
import { resolveNameForWrite } from "@/lib/contacts/names";
import { loadCustomFieldDefs } from "@/lib/custom-fields/load-defs";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";

/**
 * Dashboard-facing contact creation. The "Add contact" modal used to write
 * straight to Firestore from the browser (no server code → no webhook).
 * It now POSTs here so the create runs server-side and fires
 * `contact.created` through the shared service.
 *
 * Auth: any active member of the sub-account (collaborators included —
 * matches the Firestore rule that let members create contacts directly).
 */

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = str(body.subAccountId, 200);
  if (!subAccountId) {
    return NextResponse.json({ error: "subAccountId is required" }, { status: 400 });
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const firstName = str(body.firstName, 100);
  const lastName = str(body.lastName, 100);
  // An explicit name wins; otherwise compose it from first/last (never the
  // other way round — see lib/contacts/names.ts).
  const name = resolveNameForWrite({
    name: str(body.name, 200),
    firstName,
    lastName,
  }).slice(0, 200);
  const email = str(body.email);
  if (!name && !email) {
    return NextResponse.json(
      { error: "Provide at least a name or an email." },
      { status: 400 },
    );
  }

  // The sub-account doc is the source of truth for which agency to stamp.
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? access.agencyId ?? "";

  const phone = str(body.phone);
  const existingId = await findExistingContactId(db, subAccountId, {
    email,
    phone,
  });
  if (existingId) {
    return NextResponse.json(
      {
        error: "A contact with this email or phone already exists.",
        existingContactId: existingId,
      },
      { status: 409 },
    );
  }

  // Custom fields — validated like the v1 API (pre-existing gap: the Add
  // Contact form sent them but this route dropped them).
  let customFields: Record<string, import("@/types/custom-fields").CustomFieldValue> | undefined;
  if (body.customFields !== undefined) {
    const defs = await loadCustomFieldDefs(subAccountId, "contact");
    const cf = validateCustomFieldValues(body.customFields, defs);
    if (!cf.ok) {
      return NextResponse.json({ error: cf.error }, { status: 400 });
    }
    customFields = cf.value;
  }

  const { id, contact } = await createContactServerSide({
    subAccountId,
    agencyId,
    createdByUid: access.uid,
    // Dashboard writes are always live data — test-mode contacts only
    // come through the public API with a `lsk_test_*` key.
    mode: "live",
    name,
    email,
    phone,
    company: str(body.company),
    address: str(body.address),
    source: str(body.source),
    tags: strArray(body.tags),
    firstName,
    lastName,
    state: str(body.state, 100),
    postalCode: str(body.postalCode, 20),
    customFields,
    territoryId: typeof body.territoryId === "string" ? body.territoryId : null,
  });
  invalidateContactsCache(subAccountId);

  return NextResponse.json({ id, contact }, { status: 201 });
}
