import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Branded public Space URLs (2026-09-16) — `SubAccountDoc.slug` already
 * existed (assigned at creation, `src/lib/server/sub-accounts-service.ts`)
 * but was never actually READ anywhere for routing: nothing resolved a
 * slug back to a sub-account, and when a creator left the optional slug
 * field blank, it silently fell back to `subAccountId.slice(0, 8)` — an
 * opaque doc-id fragment, not a human-readable name. This file is the
 * missing other half: deriving a real slug when needed, resolving either
 * a slug OR a raw sub-account id back to the real tenant, and keeping
 * old `/portal/{subAccountId}` links working via redirect rather than
 * breaking them.
 *
 * Deliberately NOT a new ledger/collection — `slug` stays exactly where
 * it already lived, on `subAccounts/{id}` itself.
 */

const MAX_SLUG_LENGTH = 60;

/** "Quiana's Coaching" -> "quianas-coaching" (matches this task's own
 *  example exactly: apostrophes are dropped entirely, not turned into a
 *  dash, so a possessive name doesn't end up with an ugly double-dash). */
export function deriveSlugFromName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return base || "space";
}

/** Detects the exact fallback formula `sub-accounts-service.ts` uses when
 *  a creator leaves the slug field blank — the one case this file treats
 *  as "no real slug was ever chosen," safe to regenerate. Never touches a
 *  slug a human actually typed or that was already regenerated once. */
export function isFallbackSlug(slug: string, subAccountId: string): boolean {
  return slug === subAccountId.slice(0, 8);
}

/**
 * Finds a slug that doesn't collide with any OTHER sub-account (global
 * namespace — `/portal/{slug}` is a single flat route, not nested under
 * an agency). `excludeSubAccountId` lets a sub-account keep its own
 * current slug when re-checking (regenerating in place, not colliding
 * with itself).
 */
export async function resolveUniqueSlug(
  baseSlug: string,
  excludeSubAccountId?: string
): Promise<string> {
  const db = getAdminDb();
  let candidate = baseSlug;
  let attempt = 1;
  while (true) {
    const snap = await db
      .collection("subAccounts")
      .where("slug", "==", candidate)
      .limit(2)
      .get();
    const collision = snap.docs.some((d) => d.id !== excludeSubAccountId);
    if (!collision) return candidate;
    attempt += 1;
    const suffix = `-${attempt}`;
    candidate = `${baseSlug.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`;
  }
}

export interface ResolvedSpace {
  subAccountId: string;
  canonicalSlug: string;
}

/**
 * The one entry point every Space-facing route should resolve its URL
 * segment through. Accepts EITHER a real sub-account doc id (the
 * pre-existing, still-working `/portal/{subAccountId}` form) or a slug
 * (`/portal/{slug}`), and always returns the real id (for Firestore
 * reads/session checks, which must never see a slug — see
 * getCurrentMember's own exact-match check against the signed session
 * token's embedded subAccountId) plus the CURRENT canonical slug (for
 * redirecting an old/mismatched URL to the pretty one).
 *
 * Self-healing: if the resolved sub-account's own stored slug is still
 * the historical opaque fallback (see isFallbackSlug), this derives and
 * persists a real one from its name right here, on first resolution —
 * no separate one-time migration script needed, and it naturally covers
 * every sub-account this way, not just the ones known about today.
 *
 * Returns null only when NEITHER a doc with this id NOR a doc with this
 * slug exists — a genuinely unknown Space, same as today's 404.
 */
export async function resolveSpaceIdentifier(
  raw: string
): Promise<ResolvedSpace | null> {
  const db = getAdminDb();
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const byId = await db.doc(`subAccounts/${trimmed}`).get();
  if (byId.exists) {
    const data = byId.data() as { slug?: string; name?: string };
    const currentSlug = data.slug?.trim() || "";
    if (currentSlug && !isFallbackSlug(currentSlug, byId.id)) {
      return { subAccountId: byId.id, canonicalSlug: currentSlug };
    }
    // No real slug yet (blank, or still the opaque fallback) -- derive and
    // persist one now, from whatever name this sub-account actually has.
    const base = deriveSlugFromName(data.name || byId.id);
    const unique = await resolveUniqueSlug(base, byId.id);
    await byId.ref.set({ slug: unique }, { merge: true });
    return { subAccountId: byId.id, canonicalSlug: unique };
  }

  // Not a real doc id -- try it as a slug instead.
  const bySlug = await db
    .collection("subAccounts")
    .where("slug", "==", trimmed)
    .limit(1)
    .get();
  if (bySlug.empty) return null;
  const doc = bySlug.docs[0];
  return { subAccountId: doc.id, canonicalSlug: trimmed };
}
