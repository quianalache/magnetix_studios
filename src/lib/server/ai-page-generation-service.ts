import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { callAi } from "@/lib/comms/ai/openrouter";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { listCourseOffers } from "@/lib/server/course-offer-service";
import { listWebinarsServerSide, getWebinarServerSide } from "@/lib/server/webinar-service";
import type { BusinessBrain } from "@/types/business-brain";
import {
  AI_PAGE_GENERATION_VERSION,
  AI_PAGE_MODEL,
  AI_PAGE_SCHEMA_VERSION,
  compilePagePlan,
  assertSafePuck,
  assertPagePlanProofPolicy,
  parseGeneratedPagePlan,
  pageTypeForOutcome,
  type AiBindingType,
  type AiPageOutcome,
  type AiGenerationMetadata,
  type PagePlan,
} from "@/lib/pages-funnels/ai/page-plan";

const MAX_PROMPT_LENGTH = 4000;
const MAX_CONTEXT_LENGTH = 18000;
const MAX_PAGE_NAME = 60;
const MAX_TOKENS = 2400;
const GENERATION_TIMEOUT_MS = process.env.MAGNETIX_LOCAL_QA === "1" && process.env.AI_PAGE_GENERATION_TIMEOUT_MS
  ? Math.max(1, Number(process.env.AI_PAGE_GENERATION_TIMEOUT_MS)) : 45_000;

type Binding = { type: AiBindingType; id: string } | null;
type BoundObject = { id: string; title: string; href?: string; description?: string; priceLabel?: string; dateLabel?: string; formName?: string; eventDetails?: string };

export class AiPageGenerationError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "validation") { super(message); }
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const candidate = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number; nanoseconds?: number } | null;
  if (typeof candidate?.toDate === "function") {
    const date = candidate.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof candidate?.toMillis === "function") return new Date(candidate.toMillis());
  if (typeof candidate?.seconds === "number") return new Date(candidate.seconds * 1000 + Math.floor((candidate.nanoseconds ?? 0) / 1e6));
  return null;
}

function dateLabel(value: unknown, timezone: string): string {
  const date = asDate(value);
  if (!date) return "";
  if (!timezone) return date.toISOString();
  try { return new Intl.DateTimeFormat("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "short", timeZoneName: "short" }).format(date); }
  catch { return date.toISOString(); }
}

async function webinarDetails(webinar: Record<string, unknown>): Promise<string> {
  const timezone = cleanText(webinar.timezone, 80);
  const lines = [
    cleanText(webinar.title, 200) ? `Event: ${cleanText(webinar.title, 200)}` : "",
    dateLabel(webinar.startAt, timezone) ? `Starts: ${dateLabel(webinar.startAt, timezone)}` : "",
    dateLabel(webinar.endAt, timezone) ? `Ends: ${dateLabel(webinar.endAt, timezone)}` : "",
    cleanText(webinar.timezone, 80) ? `Timezone: ${timezone}` : "",
    cleanText(webinar.status, 40) ? `Status: ${cleanText(webinar.status, 40)}` : "",
  ];
  const hostUid = cleanText(webinar.hostUid, 160);
  if (hostUid) {
    const host = await getAdminDb().doc(`users/${hostUid}`).get();
    const hostName = cleanText(host.get("displayName"), 160) || cleanText(host.get("name"), 160);
    lines.push(`Host: ${hostName || hostUid}`);
  }
  const location = cleanText(webinar.location, 240) || cleanText(webinar.access, 240) || cleanText(webinar.accessMode, 80);
  if (location) lines.push(`Access: ${location}`);
  const joinUrl = cleanText(webinar.joinUrl, 500) || cleanText(webinar.meetingUrl, 500);
  if (joinUrl) lines.push(`Join: ${joinUrl}`);
  return lines.filter(Boolean).join("\n");
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashPrompt(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function safeSummary(value: string): string {
  return value.replace(/https?:\/\/\S+/gi, "[url]").replace(/[\r\n]+/g, " ").slice(0, 240);
}

function parseModelJson(value: string): unknown {
  const trimmed = value.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    : trimmed;
  return JSON.parse(unfenced);
}

function selectBusinessBrain(brain: BusinessBrain | null, outcome: AiPageOutcome, binding: Binding): Record<string, unknown> | null {
  if (!brain) return null;
  const relatedOfferId = binding?.type === "offer" ? binding.id : null;
  const offer = relatedOfferId ? brain.offers?.find((item) => item.id === relatedOfferId) : undefined;
  const offerNames = new Set([offer?.name, offer?.id].filter(Boolean));
  const relevantFrameworks = (brain.frameworks ?? []).filter((item) => !offerNames.size || offerNames.has(item.relatedOffer) || offerNames.has(item.relatedPillar)).slice(0, 3);
  const relevantStories = (brain.stories ?? []).filter((item) => !offerNames.size || offerNames.has(item.name)).slice(0, 3).map((story) => ({
    id: story.id, name: story.name, type: story.type, problem: story.problem, pursuit: story.pursuit, payoff: story.payoff, lesson: story.lesson,
  }));
  return {
    outcome,
    vision: brain.vision ?? {},
    audience: brain.audience ?? {},
    voice: brain.voice ?? {},
    positioning: brain.positioning ?? {},
    offer: offer ?? null,
    frameworks: relevantFrameworks,
    stories: relevantStories,
    proofSources: relevantStories,
    topics: (brain.topics ?? []).filter((item) => !offerNames.size || offerNames.has(item.relatedOffer)).slice(0, 4),
  };
}

function blueprint(outcome: AiPageOutcome): string {
  const common = "Use only the supplied binding and context. Never invent prices, dates, URLs, inclusions, guarantees, logistics, or form fields. Use a differentiated but practical section order.";
  switch (outcome) {
    case "sell_offer": return `${common} Sales page: one clear purchase CTA; may use problem, outcome, offer details, benefits, objections, FAQ, and final CTA. Proof is allowed only when an approved proof source is supplied and cited by sourceId; otherwise omit proof and social-proof claims.`;
    case "collect_leads": return `${common} Lead page: focused opt-in around the selected real Form. The Form is the primary conversion. Do not describe fake fields or destinations.`;
    case "waitlist": return `${common} Waitlist page: anticipation, what is coming, why join now, and one clear action using the selected real Form. No checkout/pricing unless supplied by the bound object.`;
    case "registration": return `${common} Registration page: use only the selected Webinar/Event title, schedule, host, and registration destination. Never manufacture logistics.`;
    case "follow_up": return `${common} Thank-you/next-steps page: short confirmation, orientation, what happens next, and at most one secondary action. No long-form hard sell.`;
    case "something_else": return `${common} Generic marketing page: make the declared primary action unmistakable. Use only registered generic components. Do not add testimonials, customer counts, results, or social proof without an approved proof source.`;
  }
}

function schemaDescription(): string {
  return JSON.stringify({ sections: [{ role: "hero|problem|benefits|details|faq|next_steps|closing|proof", heading: "string", body: "string", bullets: ["string"], ctaLabel: "string", sourceId: "approved proof source id only" }], cta: { label: "string" } });
}

async function resolveBinding(subAccountId: string, binding: Binding): Promise<BoundObject | null> {
  if (!binding) return null;
  const db = getAdminDb();
  if (binding.type === "form") {
    const snap = await db.collection("forms").doc(binding.id).get();
    if (!snap.exists || snap.get("subAccountId") !== subAccountId) throw new AiPageGenerationError("Choose a Form from this workspace.");
    const title = cleanText(snap.get("name"), 160) || "Selected Form";
    return { id: binding.id, title, formName: title };
  }
  if (binding.type === "offer") {
    const offer = (await listCourseOffers(subAccountId)).find((item) => item.id === binding.id);
    if (!offer) throw new AiPageGenerationError("Choose an Offer from this workspace.");
    return { id: offer.id, title: offer.title, description: cleanText(offer.descriptionHtml, 800), priceLabel: offer.priceTextOverride || (offer.priceCents == null ? "Free" : `${offer.currency ?? "USD"} ${(offer.priceCents / 100).toFixed(2)}`), href: `/offer/${subAccountId}/${offer.id}` };
  }
  if (binding.type === "webinar") {
    const webinar = await getWebinarServerSide(subAccountId, binding.id);
    if (!webinar) throw new AiPageGenerationError("Choose a Webinar/Event from this workspace.");
    const details = await webinarDetails(webinar as unknown as Record<string, unknown>);
    return { id: webinar.id, title: webinar.title, description: webinar.description, dateLabel: dateLabel(webinar.startAt, webinar.timezone), eventDetails: details, href: `/webinar/${subAccountId}/${webinar.slug}` };
  }
  if (binding.type === "primary_action" && !binding.id.trim()) throw new AiPageGenerationError("Describe the one thing you want someone to do.");
  return { id: binding.id, title: binding.id };
}

function buildPrompt(outcome: AiPageOutcome, prompt: string, useBrain: boolean, context: unknown, bound: BoundObject | null, brandName: string): string {
  return [
    "You are Magnetix PagePlan, a strict semantic planner. Return JSON only. Do not return Markdown, Puck JSON, HTML, scripts, arbitrary component names, or URLs.",
    `Outcome: ${outcome}`,
    `Blueprint: ${blueprint(outcome)}`,
    `Primary user emphasis: ${prompt || "Choose the strongest safe emphasis from the supplied context."}`,
    `Bound authoritative object: ${JSON.stringify(bound ?? null)}`,
    `Tenant brand identity: ${brandName || "the tenant"}`,
    `Business Brain used: ${useBrain ? "yes" : "no"}`,
    useBrain ? `Selected Business Brain context: ${JSON.stringify(context).slice(0, MAX_CONTEXT_LENGTH)}` : "Use the tenant brand identity above; do not invent strategic claims.",
    `Return exactly this semantic schema: ${schemaDescription()}`,
    "Use 2-8 sections. Every section needs role, heading, body. Keep the CTA aligned to the primary conversion.",
  ].join("\n\n");
}

async function generatePlan(prompt: string, outcome: AiPageOutcome, useBrain: boolean, context: unknown, bound: BoundObject | null, brandName: string): Promise<{ plan: PagePlan; retry: boolean; retryCause: string | null; result: Awaited<ReturnType<typeof callAi>> }> {
  const messages = [{ role: "system" as const, content: "Return one valid JSON object and nothing else." }, { role: "user" as const, content: buildPrompt(outcome, prompt, useBrain, context, bound, brandName) }];
  if (process.env.MAGNETIX_LOCAL_QA === "1" && process.env.AI_PAGE_GENERATION_TEST_FAILURE === "provider") throw new AiPageGenerationError("AI provider unavailable. Please try again.", 502, "provider");
  if (process.env.MAGNETIX_LOCAL_QA === "1" && process.env.AI_PAGE_GENERATION_TEST_FAILURE === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, GENERATION_TIMEOUT_MS + 20));
    throw new AiPageGenerationError("AI generation timed out. Please try again.", 504, "timeout");
  }
  const first = await callAi({ model: AI_PAGE_MODEL, messages, maxTokens: MAX_TOKENS, temperature: 0.35, timeoutMs: GENERATION_TIMEOUT_MS });
  try {
    const plan = parseGeneratedPagePlan(parseModelJson(first.text), outcome);
    assertPagePlanProofPolicy(plan, new Set(((context as { proofSources?: Array<{ id: string }> } | null)?.proofSources ?? []).map((source) => source.id)));
    return { plan, retry: false, retryCause: null, result: first };
  } catch (firstError) {
    const cause = firstError instanceof Error ? firstError.message : "invalid JSON";
    const retry = await callAi({ model: AI_PAGE_MODEL, messages: [...messages, { role: "assistant", content: first.text }, { role: "user", content: `Schema/policy validation failed: ${cause}. Remove any unsupported proof, use only the supplied semantic schema, and return corrected JSON only.` }], maxTokens: MAX_TOKENS, temperature: 0.2, timeoutMs: GENERATION_TIMEOUT_MS });
    const plan = parseGeneratedPagePlan(parseModelJson(retry.text), outcome);
    assertPagePlanProofPolicy(plan, new Set(((context as { proofSources?: Array<{ id: string }> } | null)?.proofSources ?? []).map((source) => source.id)));
    return { plan, retry: true, retryCause: cause, result: retry };
  }
}

export async function listAiPageSources(subAccountId: string) {
  const db = getAdminDb();
  const [forms, offers, webinars] = await Promise.all([
    db.collection("forms").where("subAccountId", "==", subAccountId).select("name").limit(100).get(),
    listCourseOffers(subAccountId),
    listWebinarsServerSide(subAccountId),
  ]);
  return {
    forms: forms.docs.map((doc) => ({ id: doc.id, name: cleanText(doc.get("name"), 160) || "Untitled form" })),
    offers: offers.map((offer) => ({ id: offer.id, name: offer.title, visibility: offer.visibility, price: offer.priceTextOverride || offer.priceCents })),
    webinars: webinars.map((webinar) => ({ id: webinar.id, name: webinar.title, slug: webinar.slug, status: webinar.status, startAt: dateLabel(webinar.startAt, webinar.timezone), timezone: webinar.timezone })),
  };
}

export async function recordAiGenerationTelemetry(input: { requestId: string; subAccountId: string; uid: string; model: string; status: "success" | "failure"; durationMs: number; errorCode?: string; errorMessage?: string }) {
  await getAdminDb().collection("aiPageGenerationTelemetry").doc(input.requestId).set({
    requestId: input.requestId, subAccountId: input.subAccountId, uid: input.uid, model: input.model,
    status: input.status, durationMs: input.durationMs, errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ? input.errorMessage.slice(0, 240) : null, createdAt: FieldValue.serverTimestamp(),
  });
}

export async function generateAiPage(input: { subAccountId: string; agencyId: string; uid: string; name: string; outcome: AiPageOutcome; binding: Binding; prompt: string; useBusinessBrain: boolean; requestId?: string }) {
  const started = Date.now();
  const prompt = cleanText(input.prompt, MAX_PROMPT_LENGTH);
  const name = cleanText(input.name, MAX_PAGE_NAME);
  if (!name) throw new AiPageGenerationError("Page name is required.");
  if (!input.outcome) throw new AiPageGenerationError("Choose what this page should do.");
  const bound = await resolveBinding(input.subAccountId, input.binding);
  const subAccount = await getAdminDb().doc(`subAccounts/${input.subAccountId}`).get();
  const brandName = cleanText(subAccount.get("name"), 160);
  const brain = input.useBusinessBrain ? await getBusinessBrain(input.subAccountId) : null;
  const context = selectBusinessBrain(brain, input.outcome, input.binding);
  const generated = await generatePlan(prompt, input.outcome, !!context, context, bound, brandName);
  const compiled = compilePagePlan(generated.plan, bound);
  try { assertSafePuck(compiled); }
  catch (error) { throw new AiPageGenerationError(error instanceof Error ? error.message : "Generated page failed safety validation.", 422); }
  const mapped = pageTypeForOutcome(input.outcome);
  const requestId = input.requestId ?? randomUUID();
  const metadata: AiGenerationMetadata = {
    generatedByAI: true, generatedAt: new Date().toISOString(), requestId, model: generated.result.model,
    pageType: mapped.pageType, schemaVersion: AI_PAGE_SCHEMA_VERSION, generationVersion: AI_PAGE_GENERATION_VERSION,
    businessBrainUsed: !!context, boundObjectId: input.binding?.id ?? null, boundObjectType: input.binding?.type ?? null,
    promptLength: prompt.length, promptHash: hashPrompt(prompt), promptSummary: safeSummary(prompt),
    promptTokens: generated.result.promptTokens, completionTokens: generated.result.completionTokens, providerCost: generated.result.cost,
    durationMs: Date.now() - started, validationRetry: generated.retry, validationRetryCause: generated.retryCause,
  };
  const db = getAdminDb();
  const ref = db.collection("pages").doc();
  await ref.set({
    name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "page",
    pageType: mapped.pageType, goal: mapped.goal, status: "draft", origin: "ai", funnelId: null, blocks: [],
    seo: { title: name, description: "", ogImage: "" }, templateId: null, agencyId: input.agencyId, subAccountId: input.subAccountId,
    createdByUid: input.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), publishedAt: null,
    puckDraftData: compiled, puckDraftUpdatedAt: FieldValue.serverTimestamp(), aiGeneration: metadata,
  });
  await recordAiGenerationTelemetry({ requestId, subAccountId: input.subAccountId, uid: input.uid, model: generated.result.model, status: "success", durationMs: metadata.durationMs });
  return { pageId: ref.id, requestId, model: generated.result.model };
}
