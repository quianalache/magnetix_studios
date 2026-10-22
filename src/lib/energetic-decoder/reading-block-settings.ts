/**
 * Reading block settings (2026-10-21) — the few domain choices each Reading
 * block offers. Deliberately small: Pages & Funnels already owns spacing,
 * backgrounds, columns, text and media, the Chart Design owns every color,
 * and the Reading's saved Content Set owns every word of interpretation.
 * Client-safe and pure — shared by the builder fields, the Standard Result
 * template and the renderers.
 */

export type AtAGlanceFact =
  | "type"
  | "strategy"
  | "authority"
  | "profile"
  | "definition"
  | "incarnationCross"
  | "signature"
  | "notSelfTheme";

export const AT_A_GLANCE_FACTS: AtAGlanceFact[] = [
  "type",
  "strategy",
  "authority",
  "profile",
  "definition",
  "incarnationCross",
  "signature",
  "notSelfTheme",
];

export const AT_A_GLANCE_FACT_LABEL: Record<AtAGlanceFact, string> = {
  type: "Type",
  strategy: "Strategy",
  authority: "Authority",
  profile: "Profile",
  definition: "Definition",
  incarnationCross: "Incarnation Cross",
  signature: "Signature",
  notSelfTheme: "Not-Self Theme",
};

/** The short "chart + key facts" set. */
export const KEY_FACTS: AtAGlanceFact[] = ["type", "strategy", "authority", "profile", "definition", "incarnationCross"];

export type CardsOrList = "cards" | "list";
export type CentersShow = "all" | "definedFirst" | "definedOnly";
export type ChipsOrCards = "chips" | "cards";
export type GatesDisplay = "grid" | "activeList";
export type GateFilter = "all" | "personality" | "design" | "both" | "inactive";
export type WheelSize = "medium" | "large";
export type SkillLayer = "coreStrengths" | "signatureTalents" | "naturalGifts";

export const SKILL_LAYERS: SkillLayer[] = ["coreStrengths", "signatureTalents", "naturalGifts"];
export const SKILL_LAYER_LABEL: Record<SkillLayer, string> = {
  coreStrengths: "Core Strengths",
  signatureTalents: "Signature Talents",
  naturalGifts: "Natural Gifts",
};

export const GATE_FILTER_LABEL: Record<GateFilter, string> = {
  all: "All Gates",
  personality: "Personality",
  design: "Design",
  both: "Both",
  inactive: "Not Activated",
};

export const WHEEL_SIZE_CLASS: Record<WheelSize, string> = {
  medium: "mx-auto w-full max-w-[560px]",
  large: "mx-auto w-full max-w-[760px]",
};

/** Comma-joined lists stored by the builder ("type,strategy") → known values, in canonical order. */
export function parseList<T extends string>(raw: unknown, allowed: readonly T[], fallback: readonly T[]): T[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : null;
  if (!parts) return [...fallback];
  const set = new Set(parts.map((p) => String(p).trim()));
  return allowed.filter((a) => set.has(a));
}
