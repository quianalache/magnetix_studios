import type { Data as PuckData, ComponentData } from "@puckeditor/core";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";
import { DEFAULT_BACKGROUND } from "@/lib/pages-funnels/puck/background";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";

/** One server-side model switch for the controlled bake-off. */
export const AI_PAGE_MODEL = process.env.AI_PAGE_GENERATION_MODEL?.trim() || "anthropic/claude-sonnet-4-6";
export const AI_PAGE_SCHEMA_VERSION = "page-plan.v1";
export const AI_PAGE_GENERATION_VERSION = "ai-page.v1";

export type AiPageOutcome =
  | "sell_offer"
  | "collect_leads"
  | "waitlist"
  | "registration"
  | "follow_up"
  | "something_else";

export type AiBindingType = "offer" | "form" | "webinar" | "previous_action" | "primary_action";

export interface PagePlanSection {
  role: string;
  heading: string;
  body: string;
  bullets?: string[];
  ctaLabel?: string;
}

export interface PagePlan {
  outcome: AiPageOutcome;
  primaryConversion: string;
  boundObject: { type: AiBindingType; id: string } | null;
  designDirection: string;
  sections: PagePlanSection[];
  cta: { intent: string; label: string };
  composition: { alignment: "left" | "center"; maxWidth: "contained" | "wide" | "full" };
  mediaIntent: "none" | "existing_asset" | "placeholder";
}

export interface AiGenerationMetadata {
  generatedByAI: true;
  generatedAt: string;
  requestId: string;
  model: string;
  pageType: string;
  schemaVersion: string;
  generationVersion: string;
  businessBrainUsed: boolean;
  boundObjectId: string | null;
  boundObjectType: AiBindingType | null;
  promptLength: number;
  promptHash: string;
  promptSummary: string;
  promptTokens: number;
  completionTokens: number;
  providerCost?: number;
  durationMs: number;
  validationRetry: boolean;
}

const OUTCOMES = new Set<AiPageOutcome>(["sell_offer", "collect_leads", "waitlist", "registration", "follow_up", "something_else"]);
const BINDINGS = new Set<AiBindingType>(["offer", "form", "webinar", "previous_action", "primary_action"]);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parsePagePlan(value: unknown): PagePlan {
  if (!value || typeof value !== "object") throw new Error("AI returned no PagePlan object.");
  const raw = value as Record<string, unknown>;
  const outcome = text(raw.outcome, 40) as AiPageOutcome;
  if (!OUTCOMES.has(outcome)) throw new Error("AI returned an unsupported page outcome.");
  const conversion = text(raw.primaryConversion, 240);
  if (!conversion) throw new Error("AI PagePlan is missing its primary conversion.");
  const rawBinding = raw.boundObject;
  let boundObject: PagePlan["boundObject"] = null;
  if (rawBinding !== null && rawBinding !== undefined) {
    if (typeof rawBinding !== "object") throw new Error("AI returned an invalid binding.");
    const b = rawBinding as Record<string, unknown>;
    const type = text(b.type, 30) as AiBindingType;
    const id = text(b.id, 120);
    if (!BINDINGS.has(type) || !id) throw new Error("AI returned an invalid binding.");
    boundObject = { type, id };
  }
  const rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  if (rawSections.length < 1 || rawSections.length > 10) throw new Error("AI returned an invalid section count.");
  const sections = rawSections.map((item) => {
    if (!item || typeof item !== "object") throw new Error("AI returned an invalid section.");
    const section = item as Record<string, unknown>;
    const parsed = {
      role: text(section.role, 60),
      heading: text(section.heading, 180),
      body: text(section.body, 1200),
      bullets: Array.isArray(section.bullets) ? section.bullets.map((b) => text(b, 240)).filter(Boolean).slice(0, 6) : undefined,
      ctaLabel: text(section.ctaLabel, 80) || undefined,
    };
    if (!parsed.role || !parsed.heading || !parsed.body) throw new Error("AI returned an incomplete section.");
    return parsed;
  });
  const rawCta = raw.cta && typeof raw.cta === "object" ? raw.cta as Record<string, unknown> : {};
  const cta = { intent: text(rawCta.intent, 180), label: text(rawCta.label, 80) };
  if (!cta.intent || !cta.label) throw new Error("AI PagePlan is missing its CTA.");
  const rawComposition = raw.composition && typeof raw.composition === "object" ? raw.composition as Record<string, unknown> : {};
  const alignment = rawComposition.alignment === "center" ? "center" : "left";
  const maxWidth = rawComposition.maxWidth === "wide" || rawComposition.maxWidth === "full" ? rawComposition.maxWidth : "contained";
  const mediaIntent = raw.mediaIntent === "existing_asset" || raw.mediaIntent === "placeholder" ? raw.mediaIntent : "none";
  return {
    outcome,
    primaryConversion: conversion,
    boundObject,
    designDirection: text(raw.designDirection, 300) || "Clear, confident, intentional composition",
    sections,
    cta,
    composition: { alignment, maxWidth },
    mediaIntent,
  };
}

type BoundObject = { id: string; title: string; href?: string; description?: string; priceLabel?: string; dateLabel?: string; formName?: string };

function node(type: string, props: Record<string, unknown>): ComponentData {
  return { type, props: { id: newPuckNodeId(), ...props } } as ComponentData;
}

function section(elements: ComponentData[], plan: PagePlan): ComponentData {
  const column = {
    type: "Column",
    props: {
      id: newPuckNodeId(), background: DEFAULT_BACKGROUND, style: DEFAULT_STYLE_CONFIG,
      width: "full", alignment: plan.composition.alignment, elements,
    },
  };
  return {
    type: "Section",
    props: {
      id: newPuckNodeId(), background: DEFAULT_BACKGROUND, style: DEFAULT_STYLE_CONFIG,
      maxWidth: plan.composition.maxWidth, fullWidthBackground: true, paddingTop: 56, paddingBottom: 56,
      rows: [{ type: "Row", props: { id: newPuckNodeId(), background: DEFAULT_BACKGROUND, style: DEFAULT_STYLE_CONFIG, gap: 24, verticalAlign: "top", columns: [column] } }],
    },
  } as ComponentData;
}

export function compilePagePlan(plan: PagePlan, bound: BoundObject | null): PuckData {
  const content: ComponentData[] = [];
  plan.sections.forEach((s, index) => {
    const elements: ComponentData[] = [
      node("Heading", { text: s.heading, level: index === 0 ? "h1" : "h2", alignment: plan.composition.alignment, style: DEFAULT_STYLE_CONFIG }),
      node("Text", { text: s.body, alignment: plan.composition.alignment, style: DEFAULT_STYLE_CONFIG }),
    ];
    if (s.bullets?.length) {
      elements.push(node("Accordion", { items: s.bullets.map((bullet) => ({ id: newPuckNodeId(), title: bullet, content: "" })), allowMultiple: true, style: DEFAULT_STYLE_CONFIG }));
    }
    if (index === plan.sections.length - 1 || s.ctaLabel) {
      const label = s.ctaLabel || plan.cta.label;
      const action = bound?.href ? { type: "url", url: bound.href } : { type: "none" };
      elements.push(node("Button", { text: label, action, style: "primary", alignment: plan.composition.alignment, background: DEFAULT_BACKGROUND, styleConfig: DEFAULT_STYLE_CONFIG }));
    }
    content.push(section(elements, plan));
  });
  if (plan.outcome === "collect_leads" && bound?.id) {
    content.push(section([node("Form", { formId: bound.id, formName: bound.formName || bound.title, style: DEFAULT_STYLE_CONFIG })], plan));
  }
  return { root: { props: {} }, content };
}

export function pageTypeForOutcome(outcome: AiPageOutcome): { pageType: "sales" | "landing" | "waitlist" | "webinar" | "thank_you" | "generic"; goal: "sales" | "lead_generation" | "registration" | "confirmation" | "other" } {
  switch (outcome) {
    case "sell_offer": return { pageType: "sales", goal: "sales" };
    case "collect_leads": return { pageType: "landing", goal: "lead_generation" };
    case "waitlist": return { pageType: "waitlist", goal: "lead_generation" };
    case "registration": return { pageType: "webinar", goal: "registration" };
    case "follow_up": return { pageType: "thank_you", goal: "confirmation" };
    case "something_else": return { pageType: "generic", goal: "other" };
  }
}
