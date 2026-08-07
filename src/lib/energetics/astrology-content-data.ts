import type { AspectType, ZodiacSign } from "./astrology";

/**
 * Default interpretive content for astrology — sign, house theme, and
 * aspect-type meanings. Standard, well-established astrological reference
 * material, written fresh for this product.
 *
 * Deliberately NOT included in this first pass: a unique write-up per
 * planet-in-sign or planet-in-house combination (120 each) — same
 * reasoning as Human Design's Channels. The general Sign/House/Aspect
 * meanings below are real and usable now; a full per-placement
 * interpretation layer (matching Gene Keys' per-gate depth) is a real
 * fast-follow, not filled in thin here.
 */

export interface SignContent {
  sign: ZodiacSign;
  element: "Fire" | "Earth" | "Air" | "Water";
  modality: "Cardinal" | "Fixed" | "Mutable";
  description: string;
}

export const SIGN_CONTENT: Record<ZodiacSign, SignContent> = {
  Aries: { sign: "Aries", element: "Fire", modality: "Cardinal", description: "Initiating, direct, quick to act — energy that wants to go first and figure it out along the way." },
  Taurus: { sign: "Taurus", element: "Earth", modality: "Fixed", description: "Steady, sensory, slow to move and slower to be moved — builds what lasts and doesn't rush the process." },
  Gemini: { sign: "Gemini", element: "Air", modality: "Mutable", description: "Curious, quick-minded, drawn to variety and conversation — takes in and connects information from everywhere." },
  Cancer: { sign: "Cancer", element: "Water", modality: "Cardinal", description: "Protective, emotionally attuned, oriented around home and belonging — leads with feeling, not force." },
  Leo: { sign: "Leo", element: "Fire", modality: "Fixed", description: "Warm, expressive, wants to be seen for who it genuinely is — generous energy that thrives with real audience and real stakes." },
  Virgo: { sign: "Virgo", element: "Earth", modality: "Mutable", description: "Precise, practical, improves whatever it touches — energy oriented around refinement and being genuinely useful." },
  Libra: { sign: "Libra", element: "Air", modality: "Cardinal", description: "Relational, weighs both sides, seeks balance and fairness — thinks in terms of the other person, not just itself." },
  Scorpio: { sign: "Scorpio", element: "Water", modality: "Fixed", description: "Intense, private, drawn beneath the surface of things — trust is earned slowly, but goes deep once given." },
  Sagittarius: { sign: "Sagittarius", element: "Fire", modality: "Mutable", description: "Expansive, philosophical, allergic to small thinking — wants the bigger picture, the horizon, the honest answer." },
  Capricorn: { sign: "Capricorn", element: "Earth", modality: "Cardinal", description: "Disciplined, long-game energy — builds toward real, earned authority rather than shortcuts." },
  Aquarius: { sign: "Aquarius", element: "Air", modality: "Fixed", description: "Independent, idea-driven, oriented toward the collective rather than the personal — thinks in systems and futures." },
  Pisces: { sign: "Pisces", element: "Water", modality: "Mutable", description: "Porous, imaginative, dissolves boundaries between self and everything else — deeply intuitive, needs real containment to function." },
};

export interface HouseContent {
  house: number;
  theme: string;
  description: string;
}

export const HOUSE_CONTENT: Record<number, HouseContent> = {
  1: { house: 1, theme: "Self & Identity", description: "How you show up, first impressions, the lens the rest of the chart gets filtered through." },
  2: { house: 2, theme: "Resources & Values", description: "Money, possessions, and what you actually value — self-worth expressed through the material." },
  3: { house: 3, theme: "Communication & Learning", description: "How you think, talk, and take in information — siblings, everyday environment, short trips." },
  4: { house: 4, theme: "Home & Roots", description: "Family, upbringing, the private foundation everything else is built on." },
  5: { house: 5, theme: "Creativity & Expression", description: "Play, romance, creative self-expression, children — what you do purely because it's alive in you." },
  6: { house: 6, theme: "Work & Wellbeing", description: "Daily routine, health habits, service — the systems that keep everything else functioning." },
  7: { house: 7, theme: "Partnership", description: "Marriage, close one-on-one relationships, open business partnerships — what you seek in a real other." },
  8: { house: 8, theme: "Transformation & Shared Resources", description: "Intimacy, merging (financial and emotional), what gets transformed through crisis or depth." },
  9: { house: 9, theme: "Belief & Expansion", description: "Higher education, travel, philosophy, the meaning-making part of life." },
  10: { house: 10, theme: "Career & Public Life", description: "Reputation, vocation, the role you're known for in the world." },
  11: { house: 11, theme: "Community & Vision", description: "Friendships, groups, hopes for the future — the collective you belong to." },
  12: { house: 12, theme: "The Unseen", description: "The subconscious, solitude, endings, what happens behind the scenes before it's ready to be seen." },
};

export const ASPECT_TYPE_CONTENT: Record<AspectType, string> = {
  Conjunction: "The two energies fuse into one — whatever they touch, they touch together, for better or worse.",
  Sextile: "An easy, opportunity-based connection — works when actively used, doesn't force itself.",
  Square: "Real tension that demands action — friction that, worked with rather than avoided, tends to build something.",
  Trine: "A natural, effortless flow between the two — talent that can also go unused simply because it's too easy.",
  Opposition: "Pull between two poles that need to find balance rather than one winning — awareness through the other.",
};
