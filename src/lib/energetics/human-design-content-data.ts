import type { HdAuthority, HdType } from "./human-design";
import type { CenterKey } from "./human-design-data";

/**
 * Default interpretive content for the parts of a Human Design chart
 * practitioners actually explain to a client: Type + Strategy, Authority,
 * and each Center's defined-vs-undefined meaning. Standard, well-
 * established Human Design system teaching (Ra Uru Hu's original
 * framework, now public domain across every practitioner) — written fresh
 * for this product, not copied from any one author's book, same approach
 * already used for the Gene Keys gate defaults.
 *
 * Deliberately NOT included in this first pass: per-Channel descriptions
 * (36 of them) — the channel NAME, gate pair, and connected centers are
 * all real/correct (human-design-data.ts), just no prose write-up yet.
 * Flagged rather than filled with thin one-liners; a real fast-follow.
 */

export interface TypeContent {
  type: HdType;
  strategy: string;
  description: string;
}

export const TYPE_CONTENT: Record<HdType, TypeContent> = {
  Generator: {
    type: "Generator",
    strategy: "Wait to respond",
    description:
      "Sustainable, sacral life-force energy — built to work, but only lights up when responding to something real in front of them rather than initiating from the head. The most common type.",
  },
  "Manifesting Generator": {
    type: "Manifesting Generator",
    strategy: "Wait to respond, then inform before acting",
    description:
      "Generator energy that also has a direct line from a motor to the Throat — fast, multi-track, often skips steps. Still needs to respond first; the extra step is telling others before moving.",
  },
  Manifestor: {
    type: "Manifestor",
    strategy: "Inform before acting",
    description:
      "A motor connects straight to the Throat with no Sacral involved — energy to initiate on their own timing, independent of waiting for a response. The friction point is usually other people being caught off guard; informing first (not asking permission) smooths that.",
  },
  Projector: {
    type: "Projector",
    strategy: "Wait for the invitation",
    description:
      "No Sacral, no motor-to-throat connection — built to see and guide, not to grind. Works best invited into a role rather than pushing in, and needs real rest; their energy isn't designed to sustain like a Generator's.",
  },
  Reflector: {
    type: "Reflector",
    strategy: "Wait a full lunar cycle (~28 days) before big decisions",
    description:
      "Every center undefined — a mirror for whatever environment and people they're around. Rare, and the most sensitive to the wrong environment; a full moon cycle gives their own clarity time to surface past whoever they were just with.",
  },
};

export interface AuthorityContent {
  authority: HdAuthority;
  description: string;
}

export const AUTHORITY_CONTENT: Record<HdAuthority, AuthorityContent> = {
  "Emotional (Solar Plexus)": {
    authority: "Emotional (Solar Plexus)",
    description:
      "No decision is clear in the moment — there's always a wave. Sleep on it, revisit it, and let the emotional high and low both pass before committing to anything that matters.",
  },
  Sacral: {
    authority: "Sacral",
    description:
      "A gut-level yes or no, felt as a response in the body — not thought through. Trustworthy in the moment it's asked, unreliable if reasoned about afterward.",
  },
  Splenic: {
    authority: "Splenic",
    description:
      "Instant, quiet intuitive knowing — one clear signal, once, in the moment. It doesn't repeat itself or explain its reasoning, so the work is noticing it before it's second-guessed away.",
  },
  "Ego (Heart)": {
    authority: "Ego (Heart)",
    description:
      "Willpower-based — what do I have the material want and drive to actually commit to? A yes here needs real desire behind it, not just a good reason.",
  },
  "Self-Projected (G)": {
    authority: "Self-Projected (G)",
    description:
      "Clarity comes out through talking, not before it — hearing their own voice describe an option (ideally to someone who just listens) is how the truth of it surfaces.",
  },
  "Mental (Environmental)": {
    authority: "Mental (Environmental)",
    description:
      "No inner authority to check against — clarity comes from thinking out loud in the right environment, sounding ideas off trusted others rather than deciding alone in a vacuum.",
  },
  "Lunar (Reflector)": {
    authority: "Lunar (Reflector)",
    description:
      "Reflectors have no defined authority to check at all — clarity accumulates over a full ~28-day lunar cycle, sampling a decision across different days and different lighting before it's trustworthy.",
  },
};

export interface CenterContent {
  center: CenterKey;
  definedText: string;
  undefinedText: string;
}

export const CENTER_CONTENT: Record<CenterKey, CenterContent> = {
  head: {
    center: "head",
    definedText:
      "A consistent source of inspiration and mental pressure — questions and ideas that press outward reliably, on their own rhythm.",
    undefinedText:
      "Takes in and amplifies the mental pressure and questions of others — can feel like constant inspiration, or like never-ending borrowed anxiety, depending on the company kept.",
  },
  ajna: {
    center: "ajna",
    definedText:
      "A fixed, consistent way of processing and forming certainty — opinions and conclusions that hold steady over time, for better or worse.",
    undefinedText:
      "Flexible, adaptable thinking that can see many sides — but certainty borrowed from whoever's nearby, so opinions can feel fixed in the moment and shift entirely later.",
  },
  throat: {
    center: "throat",
    definedText:
      "A reliable channel for turning energy into expression, action, or manifestation — consistent access to speaking and doing.",
    undefinedText:
      "Expression that amplifies whatever energy is currently running through the rest of the chart — can be the loudest voice in the room or go completely silent, depending on what's defined nearby and who's around.",
  },
  g: {
    center: "g",
    definedText:
      "A fixed sense of identity and direction — a consistent sense of self and where life is headed, not easily shaken by circumstance.",
    undefinedText:
      "Identity and direction that shift with environment and relationships — not a flaw, but a real invitation to let life's direction unfold rather than forcing a fixed self-image.",
  },
  heart: {
    center: "heart",
    definedText:
      "Reliable willpower and self-worth — consistent capacity to commit, compete, and follow through on material promises.",
    undefinedText:
      "No consistent willpower to prove anything — the trap is over-proving self-worth to others; the gift, once seen, is not needing to.",
  },
  sacral: {
    center: "sacral",
    definedText:
      "Sustainable, renewable life-force energy — the body's own engine for work and generative energy, day after day.",
    undefinedText:
      "No sustainable life-force engine of its own — takes in and amplifies the Sacral energy of whoever's around, which is exactly why knowing when to stop matters here more than anywhere else.",
  },
  solarplexus: {
    center: "solarplexus",
    definedText:
      "A built-in emotional wave — clarity is never immediate here, it arrives over time as the wave moves through highs and lows.",
    undefinedText:
      "Takes in and amplifies the emotional atmosphere of others — real emotional sensitivity, easily mistaken for having emotional authority when the wave actually belongs to someone else.",
  },
  spleen: {
    center: "spleen",
    definedText:
      "A consistent, well-tuned instinct for what's safe and healthy in the moment — quiet, in-the-now intuition that doesn't repeat itself.",
    undefinedText:
      "Instinct and body-awareness borrowed from the environment — can pick up on fear or health cues that aren't actually theirs, so real self-care needs more deliberate attention than it might for others.",
  },
  root: {
    center: "root",
    definedText:
      "A consistent, well-managed source of drive and pressure to get things done and move forward.",
    undefinedText:
      "Amplifies the pressure and urgency of whoever's nearby — can feel like a constant rush to finish or act that isn't actually coming from within.",
  },
};
