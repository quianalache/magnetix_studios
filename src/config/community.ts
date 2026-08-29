/**
 * Community + Courses — central config (single source of truth for naming,
 * gamification thresholds, and limits). Client-safe: no secrets, no
 * `server-only` import, so both server routes and client components can read it.
 */

export const COMMUNITY = {
  /** Sidebar + surface label. */
  name: "Community",
} as const;

/** Max length of a group's public "About" copy. Enforced server + client. */
export const ABOUT_MAX_CHARS = 1000;

/** Max length of the short join-card tagline. Enforced server + client. */
export const TAGLINE_MAX_CHARS = 100;

/** Max length of a group's Community Guidelines copy. Same budget as About,
 *  reusing the same rich-text editor + sanitizer. Enforced server + client. */
export const GUIDELINES_MAX_CHARS = 1000;

/** Max number of owner-configurable Home sidebar content cards (Part 6). */
export const SIDEBAR_CARDS_MAX = 2;

/** Field-length caps for a sidebar content card. */
export const SIDEBAR_CARD_HEADING_MAX = 60;
export const SIDEBAR_CARD_BODY_MAX = 200;
export const SIDEBAR_CARD_BUTTON_LABEL_MAX = 30;

/**
 * About page "What You'll Get Inside" benefits (2026-08-29 conversion-layout
 * redesign, approved as real structured data — see CommunityAboutBenefit).
 * Sensible V1 limits, not over-engineered: a title needs to read at a
 * glance in a compact card, a description needs to stay to one short line
 * or two, same spirit as the sidebar-card limits above.
 */
export const ABOUT_BENEFITS_MAX = 4;
export const ABOUT_BENEFIT_TITLE_MAX = 50;
export const ABOUT_BENEFIT_DESCRIPTION_MAX = 140;

/**
 * Skool's exact points→level curve (1 like = 1 point, per-group). A member's
 * level is the highest entry whose threshold is ≤ their points. Used by the
 * gamification slice + level-locked courses; defined here so the auth slice and
 * later slices share one table.
 */
export const LEVEL_THRESHOLDS: readonly number[] = [
  0, // Level 1
  5, // Level 2
  20, // Level 3
  65, // Level 4
  155, // Level 5
  515, // Level 6
  2015, // Level 7
  8015, // Level 8
  33015, // Level 9
] as const;

/** Resolve a points total to a 1–9 level. */
export function levelForPoints(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}
