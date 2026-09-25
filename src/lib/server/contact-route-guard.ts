import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { territoryGate } from "@/lib/auth/territory-filter";
import type { Contact } from "@/types/contacts";

type Access = Exclude<
  Awaited<ReturnType<typeof requireSubAccountMember>>,
  NextResponse
>;

export interface ContactRouteContext {
  access: Access;
  contact: Contact;
  isAdmin: boolean;
}

/**
 * Shared guard for the per-contact routes added by the Contacts redesign
 * (notes, activity, submitted forms, purchases & access): loads the contact,
 * requires the caller to be an active member (or admin) of the contact's
 * sub-account, then applies the territory gate so a scoped collaborator
 * can't reach a contact outside their territories — the same checks the
 * Firestore rules apply to the contact doc itself.
 *
 * Returns 404 for a missing contact before any auth detail leaks.
 */
export async function requireContactRoute(
  request: Request,
  contactId: string,
  opts: { admin?: boolean } = {},
): Promise<ContactRouteContext | NextResponse> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(contactId)) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const contact = { id: snap.id, ...(snap.data() as Omit<Contact, "id">) } as Contact;
  if (!contact.subAccountId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  const access = opts.admin
    ? await requireSubAccountAdmin(request, contact.subAccountId)
    : await requireSubAccountMember(request, contact.subAccountId);
  if (access instanceof NextResponse) return access;

  const gate = await territoryGate(access, contact.territoryId ?? null);
  if (gate) return gate;

  return {
    access,
    contact,
    isAdmin:
      access.subAccountRole === "admin" ||
      access.subAccountRole === "agencyOwner",
  };
}

/**
 * uid → display name for authors, from the sub-account's member rows (the
 * existing team-member structure — no new directory). Agency owners who
 * aren't in the member list fall back to their `users/{uid}` profile;
 * unknown uids are simply absent (the UI shows "Team member").
 */
export async function resolveAuthorNames(
  subAccountId: string,
  uids: string[],
): Promise<Map<string, { name: string; email: string }>> {
  const out = new Map<string, { name: string; email: string }>();
  const unique = [...new Set(uids.filter((u) => /^[A-Za-z0-9_-]{6,128}$/.test(u)))];
  if (unique.length === 0) return out;
  const db = getAdminDb();
  const refs = unique.map((uid) =>
    db.doc(`subAccounts/${subAccountId}/subAccountMembers/${uid}`),
  );
  const snaps = await db.getAll(...refs);
  const missing: string[] = [];
  snaps.forEach((s, i) => {
    const d = s.data();
    if (s.exists && d) {
      out.set(unique[i], {
        name: (d.displayName as string) || (d.email as string) || "Team member",
        email: (d.email as string) ?? "",
      });
    } else {
      missing.push(unique[i]);
    }
  });
  // Agency owners aren't always in subAccountMembers — fall back to the
  // slim users/{uid} profile, never to anything client-supplied.
  if (missing.length > 0) {
    const userSnaps = await db.getAll(...missing.map((u) => db.doc(`users/${u}`)));
    userSnaps.forEach((s, i) => {
      const d = s.data();
      if (s.exists && d) {
        out.set(missing[i], {
          name: (d.displayName as string) || (d.email as string) || "Team member",
          email: (d.email as string) ?? "",
        });
      }
    });
  }
  return out;
}
