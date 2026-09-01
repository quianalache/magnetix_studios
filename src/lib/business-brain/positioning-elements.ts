/**
 * The 12 real Positioning Elements™ — verbatim slugs, names, and
 * definitions from the migration spec §4.8/§17 (captured live from the
 * original YouTube Content Studio's Settings -> Positioning Elements
 * Library, cross-checked against the real slugs found in the owner's
 * migrated data). Not YouTube-specific — part of the shared Business
 * Brain's Positioning section.
 */

export interface PositioningElement {
  slug: string;
  name: string;
  definition: string;
}

export const POSITIONING_ELEMENTS: PositioningElement[] = [
  {
    slug: "root-cause",
    name: "The Root Cause Element™",
    definition: "Reveals the deeper issue behind the surface-level problem.",
  },
  {
    slug: "unpopular-truth",
    name: "The Unpopular Truth Element™",
    definition:
      "Says the honest thing my audience needs to hear, even if it challenges common advice.",
  },
  {
    slug: "desire-expansion",
    name: "The Desire Expansion Element™",
    definition: "Helps the viewer want more and see a bigger possibility.",
  },
  {
    slug: "myth-busting",
    name: "The Myth-Busting Element™",
    definition: "Dismantles false beliefs, outdated advice, or confusing industry noise.",
  },
  {
    slug: "elevated-strategy",
    name: "The Elevated Strategy Element™",
    definition: "Shows the deeper strategy behind why something actually works.",
  },
  {
    slug: "belief-shift",
    name: "The Belief Shift Element™",
    definition: "Reframes the internal belief that is blocking action.",
  },
  {
    slug: "simplified-solution",
    name: "The Simplified Solution Element™",
    definition: "Makes the path feel cleaner, simpler, and less overwhelming.",
  },
  {
    slug: "mistake-expose",
    name: "The Mistake Exposé Element™",
    definition: "Reveals the subtle mistake costing the viewer results.",
  },
  {
    slug: "results-pathway",
    name: "The Results Pathway Element™",
    definition: "Shows the sequence, roadmap, or process to get the result.",
  },
  {
    slug: "doing-the-most",
    name: "The You're Doing the Most Element™",
    definition: "Calls out over-efforting, wasted energy, or unnecessary complexity.",
  },
  {
    slug: "behind-the-strategy",
    name: "The Behind-the-Strategy Element™",
    definition: "Reveals the reasoning behind a strategy, decision, or method.",
  },
  {
    slug: "decision-maker",
    name: "The Decision-Maker Element™",
    definition: "Helps the viewer compare options and make an aligned choice.",
  },
];

export function positioningElementLabel(slug: string): string {
  return POSITIONING_ELEMENTS.find((e) => e.slug === slug)?.name ?? slug;
}
