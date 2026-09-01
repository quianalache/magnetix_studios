import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { businessBrainDocPath } from "@/types/business-brain";
import type { BusinessBrain } from "@/types/business-brain";

/**
 * The ONE shared read path for a sub-account's Business Brain — the
 * strategic context layer (Creator Vision, Audience, Offers, Frameworks,
 * Stories + Proof, Brand Voice, Topics + Subtopics, Positioning) shared
 * across every AI-assisted content feature, not owned by any one of them.
 *
 * Deliberately minimal: this returns the whole normalized document, not a
 * "selected sections" API — a caller that only needs Audience + Brand
 * Voice + Creator Vision (e.g. YouTube Content Studio's Script Prompt
 * Builder) just destructures what it needs from the result. Building a
 * separate selective-fetch API now would be premature — Firestore already
 * returns the whole (small, ~26KB in the one real account so far) document
 * in a single read, so there's no cost this would actually save.
 *
 * Returns null when the sub-account hasn't set up a Business Brain yet —
 * a normal, expected state, not an error. Never falls back to reading the
 * legacy `ytcs/brain` location: Business Brain is no longer conceptually
 * owned by YouTube Content Studio, so this shared reader has no YTCS-
 * specific knowledge baked into it. See docs/product/
 * youtube-content-studio-migration-spec.md's Business Brain Architecture
 * section for the migration/compatibility story.
 */
export async function getBusinessBrain(
  subAccountId: string,
): Promise<BusinessBrain | null> {
  const snap = await getAdminDb().doc(businessBrainDocPath(subAccountId)).get();
  if (!snap.exists) return null;
  return snap.data() as BusinessBrain;
}
