import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Embeds — list-first replacement for the old single "Share" card
 * (2026-08-09, same feedback pass as Chart Designs: "a different tab for
 * embed chart, so you could see the different charts that... you created
 * embed codes for"). A sub-account can now save multiple named embed
 * records (e.g. "Instagram Bio Link", "Website Widget") instead of copying
 * the one anonymous link/iframe over and over with no way to tell them
 * apart later.
 *
 * Honest scope note: every embed currently points at the same real public
 * decoder tool (`buildDecoderUrl`) — there's no per-embed chart-design
 * selection or view/submission tracking wired up yet. That's real future
 * work, not built here. This ships the part that's genuinely done: naming
 * and organizing the links you hand out, which is what was actually broken
 * (you couldn't tell your embeds apart or manage them as a list at all).
 */

export interface EmbedConfig {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  /** Free-text note on where this is placed — e.g. "magnetixstudios.com footer". Optional. */
  placementNote: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
