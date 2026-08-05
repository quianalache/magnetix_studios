import "server-only";

import type { Firestore } from "firebase-admin/firestore";

/**
 * Shared slug rules — same shape as booking pages' SLUG_RE
 * (src/lib/booking/validation.ts): lowercase kebab-case, 1–48 chars, must
 * start/end alphanumeric. Forms/community/booking each grew their own
 * slightly different slugify() before this existed; this file is for NEW
 * slug-bearing entities (Standalone Courses, Course Offers) and the
 * custom-domain routing layer — not a retrofit of the existing ones.
 */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const RESERVED_SLUGS = new Set([
  "new",
  "edit",
  "settings",
  "api",
  "login",
  "logout",
  "admin",
  "",
]);

/** Turn a free-text title into a candidate slug. Not guaranteed unique. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || "item"
  );
}

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

/**
 * Whether `slug` is free to use in `collectionPath` (see `ensureUniqueSlug`
 * for the scoping assumption). Used for explicit user-typed slug edits,
 * where silently renumbering to "slug-2" would be surprising — the caller
 * should reject with an error instead.
 */
export async function isSlugAvailable(opts: {
  db: Firestore;
  collectionPath: string;
  slug: string;
  excludeDocId?: string;
}): Promise<boolean> {
  const snap = await opts.db
    .collection(opts.collectionPath)
    .where("slug", "==", opts.slug)
    .limit(2)
    .get();
  return !snap.docs.some((d) => d.id !== opts.excludeDocId);
}

/**
 * Given a candidate base slug, find the first variant (base, base-2,
 * base-3, ...) not already used by another doc in `collectionPath`.
 * Excludes `excludeDocId` so re-saving a doc under its own existing slug
 * doesn't collide with itself.
 *
 * `collectionPath` is expected to already be scoped to one sub-account
 * (e.g. `subAccounts/{saId}/standaloneCourses`, a structural subcollection,
 * not a top-level one filtered by a `subAccountId` field) — so this is a
 * single-field equality query with no composite index required.
 *
 * Uniqueness is scoped per sub-account, not global — the same slug can
 * exist on two different sub-accounts' opaque `/course/{saId}/{slug}`-style
 * fallback routes without conflict. It only becomes globally load-bearing
 * once a sub-account has a verified custom domain, at which point the
 * domain itself is what disambiguates.
 */
export async function ensureUniqueSlug(opts: {
  db: Firestore;
  collectionPath: string;
  base: string;
  excludeDocId?: string;
}): Promise<string> {
  const { db, collectionPath, base, excludeDocId } = opts;
  const root = slugify(base);
  let candidate = root;
  let attempt = 1;
  // Small collection sizes per sub-account (dozens, not millions) — a loop
  // of point queries is simpler and cheap enough vs. a batched exists-check.
  while (true) {
    const snap = await db
      .collection(collectionPath)
      .where("slug", "==", candidate)
      .limit(2)
      .get();
    const collides = snap.docs.some((d) => d.id !== excludeDocId);
    if (!collides) return candidate;
    attempt += 1;
    candidate = `${root}-${attempt}`;
  }
}
