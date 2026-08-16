/**
 * The 64 Gene Keys — standard system nomenclature (shadow/gift/siddhi name
 * triads), consistent across every Gene Keys teacher/practitioner. This is
 * necessary naming to describe a profile at all, not proprietary phrasing —
 * unlike longer interpretive descriptions (which belong in per-product
 * copy, written fresh, not lifted from any one author's book).
 *
 * GATE_WHEEL_ORDER is the mapping from zodiacal position to gate number —
 * gate 41 sits at the wheel's start (0° in wheel-space, i.e. 302° raw
 * ecliptic longitude — see gene-keys.ts's WHEEL_OFFSET_DEG). This ordering
 * is fixed across the Human Design / Gene Keys system; every implementation
 * (including this one) must reproduce it exactly or gate numbers are wrong.
 */

export const GATE_WHEEL_ORDER: readonly number[] = [
  41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2,
  23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59,
  40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26,
  11, 10, 58, 38, 54, 61, 60,
];

/**
 * The wheel's real astronomical anchor — moved here 2026-08-15 (Phase 6,
 * Mandala rebuild) from being a private constant inside gate-wheel.ts
 * (which is `server-only` and can't be imported into a client-rendered
 * chart) so the Mandala's zodiac ring can compute each gate's real
 * ecliptic sign without a second, hand-copied "302" living in two files.
 * gate-wheel.ts now imports these from here instead of declaring its own —
 * same values, single source, not a recalculation or a new engine.
 */
export const WHEEL_START_LONGITUDE_DEG = 302;
export const DEGREES_PER_GATE = 360 / 64;

/**
 * The 12 tropical zodiac signs — moved here 2026-08-15 (Phase 6, Mandala
 * rebuild) from astrology.ts, which is `server-only` and therefore couldn't
 * be imported into the client-rendered Mandala's zodiac ring. Same values,
 * same order, single source — astrology.ts now re-exports these instead of
 * declaring its own, exactly the WHEEL_START_LONGITUDE_DEG pattern above.
 */
export type ZodiacSign =
  | "Aries" | "Taurus" | "Gemini" | "Cancer" | "Leo" | "Virgo"
  | "Libra" | "Scorpio" | "Sagittarius" | "Capricorn" | "Aquarius" | "Pisces";

export const SIGNS: readonly ZodiacSign[] = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export interface GeneKeyNames {
  gate: number;
  shadow: string;
  gift: string;
  siddhi: string;
}

export const GENE_KEYS: readonly GeneKeyNames[] = [
  { gate: 1, shadow: "Entropy", gift: "Freshness", siddhi: "Beauty" },
  { gate: 2, shadow: "Dislocation", gift: "Orientation", siddhi: "Unity" },
  { gate: 3, shadow: "Chaos", gift: "Innovation", siddhi: "Innocence" },
  { gate: 4, shadow: "Intolerance", gift: "Understanding", siddhi: "Forgiveness" },
  { gate: 5, shadow: "Impatience", gift: "Patience", siddhi: "Timelessness" },
  { gate: 6, shadow: "Conflict", gift: "Diplomacy", siddhi: "Peace" },
  { gate: 7, shadow: "Division", gift: "Guidance", siddhi: "Virtue" },
  { gate: 8, shadow: "Mediocrity", gift: "Style", siddhi: "Exquisiteness" },
  { gate: 9, shadow: "Inertia", gift: "Determination", siddhi: "Invincibility" },
  { gate: 10, shadow: "Self-Obsession", gift: "Naturalness", siddhi: "Being" },
  { gate: 11, shadow: "Obscurity", gift: "Idealism", siddhi: "Light" },
  { gate: 12, shadow: "Vanity", gift: "Discrimination", siddhi: "Purity" },
  { gate: 13, shadow: "Discord", gift: "Discernment", siddhi: "Empathy" },
  { gate: 14, shadow: "Compromise", gift: "Competence", siddhi: "Bounteousness" },
  { gate: 15, shadow: "Dullness", gift: "Magnetism", siddhi: "Florescence" },
  { gate: 16, shadow: "Indifference", gift: "Versatility", siddhi: "Mastery" },
  { gate: 17, shadow: "Opinion", gift: "Far-Sightedness", siddhi: "Omniscience" },
  { gate: 18, shadow: "Judgment", gift: "Integrity", siddhi: "Perfection" },
  { gate: 19, shadow: "Co-Dependence", gift: "Sensitivity", siddhi: "Sacrifice" },
  { gate: 20, shadow: "Superficiality", gift: "Self Assurance", siddhi: "Presence" },
  { gate: 21, shadow: "Control", gift: "Authority", siddhi: "Valor" },
  { gate: 22, shadow: "Dishonor", gift: "Graciousness", siddhi: "Grace" },
  { gate: 23, shadow: "Complexity", gift: "Simplicity", siddhi: "Quintessence" },
  { gate: 24, shadow: "Addiction", gift: "Invention", siddhi: "Silence" },
  { gate: 25, shadow: "Constriction", gift: "Acceptance", siddhi: "Universal Love" },
  { gate: 26, shadow: "Pride", gift: "Artfulness", siddhi: "Invisibility" },
  { gate: 27, shadow: "Selfishness", gift: "Altruism", siddhi: "Selflessness" },
  { gate: 28, shadow: "Purposelessness", gift: "Totality", siddhi: "Immortality" },
  { gate: 29, shadow: "Half-Heartedness", gift: "Commitment", siddhi: "Devotion" },
  { gate: 30, shadow: "Desire", gift: "Lightness", siddhi: "Rapture" },
  { gate: 31, shadow: "Arrogance", gift: "Leadership", siddhi: "Humility" },
  { gate: 32, shadow: "Failure", gift: "Preservation", siddhi: "Veneration" },
  { gate: 33, shadow: "Forgetting", gift: "Mindfulness", siddhi: "Revelation" },
  { gate: 34, shadow: "Force", gift: "Strength", siddhi: "Majesty" },
  { gate: 35, shadow: "Hunger", gift: "Adventure", siddhi: "Boundlessness" },
  { gate: 36, shadow: "Turbulence", gift: "Humanity", siddhi: "Compassion" },
  { gate: 37, shadow: "Weakness", gift: "Equality", siddhi: "Tenderness" },
  { gate: 38, shadow: "Struggle", gift: "Perseverance", siddhi: "Honor" },
  { gate: 39, shadow: "Provocation", gift: "Dynamism", siddhi: "Liberation" },
  { gate: 40, shadow: "Exhaustion", gift: "Resolve", siddhi: "Divine Will" },
  { gate: 41, shadow: "Fantasy", gift: "Anticipation", siddhi: "Emanation" },
  { gate: 42, shadow: "Expectation", gift: "Detachment", siddhi: "Celebration" },
  { gate: 43, shadow: "Deafness", gift: "Insight", siddhi: "Epiphany" },
  { gate: 44, shadow: "Interference", gift: "Teamwork", siddhi: "Synarchy" },
  { gate: 45, shadow: "Dominance", gift: "Synergy", siddhi: "Communion" },
  { gate: 46, shadow: "Seriousness", gift: "Delight", siddhi: "Ecstasy" },
  { gate: 47, shadow: "Oppression", gift: "Transmutation", siddhi: "Transfiguration" },
  { gate: 48, shadow: "Inadequacy", gift: "Resourcefulness", siddhi: "Wisdom" },
  { gate: 49, shadow: "Reaction", gift: "Revolution", siddhi: "Rebirth" },
  { gate: 50, shadow: "Corruption", gift: "Equilibrium", siddhi: "Harmony" },
  { gate: 51, shadow: "Agitation", gift: "Initiative", siddhi: "Awakening" },
  { gate: 52, shadow: "Stress", gift: "Restraint", siddhi: "Stillness" },
  { gate: 53, shadow: "Immaturity", gift: "Expansion", siddhi: "Superabundance" },
  { gate: 54, shadow: "Greed", gift: "Aspiration", siddhi: "Ascension" },
  { gate: 55, shadow: "Victimization", gift: "Freedom", siddhi: "Freedom" },
  { gate: 56, shadow: "Distraction", gift: "Enrichment", siddhi: "Intoxication" },
  { gate: 57, shadow: "Unease", gift: "Intuition", siddhi: "Clarity" },
  { gate: 58, shadow: "Dissatisfaction", gift: "Vitality", siddhi: "Bliss" },
  { gate: 59, shadow: "Dishonesty", gift: "Intimacy", siddhi: "Transparency" },
  { gate: 60, shadow: "Limitation", gift: "Realism", siddhi: "Justice" },
  { gate: 61, shadow: "Psychosis", gift: "Inspiration", siddhi: "Sanctity" },
  { gate: 62, shadow: "Intellect", gift: "Precision", siddhi: "Impeccability" },
  { gate: 63, shadow: "Doubt", gift: "Inquiry", siddhi: "Truth" },
  { gate: 64, shadow: "Confusion", gift: "Imagination", siddhi: "Illumination" },
];

export function geneKeyFor(gate: number): GeneKeyNames {
  return GENE_KEYS[gate - 1] ?? GENE_KEYS[0];
}
