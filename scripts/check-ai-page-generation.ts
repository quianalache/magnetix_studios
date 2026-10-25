import assert from "node:assert/strict";
import { AI_PAGE_DEFAULT_MODEL, AI_PAGE_MODEL, assertPagePlanProofPolicy, assertSafePuck, compilePagePlan, pageTypeForOutcome, parseGeneratedPagePlan, parsePagePlan } from "../src/lib/pages-funnels/ai/page-plan";

const plan = parsePagePlan({
  outcome: "sell_offer",
  primaryConversion: "Purchase the selected Offer",
  boundObject: { type: "offer", id: "offer-1" },
  designDirection: "Direct and premium",
  sections: [
    { role: "hero", heading: "Make the next move simpler", body: "A focused invitation grounded in the selected Offer." },
    { role: "benefits", heading: "What changes", body: "A short explanation of the outcome.", bullets: ["Clear path", "Practical support"] },
  ],
  cta: { intent: "purchase", label: "See the offer" },
  composition: { alignment: "left", maxWidth: "contained" },
  mediaIntent: "none",
});
const compiled = compilePagePlan(plan, { id: "offer-1", title: "Real Offer", href: "/offer/sa/offer-1" });
assertSafePuck(compiled);
assert.equal(compiled.content.length, 2);
assert.equal((compiled.content[0] as { type: string }).type, "Section");
const waitlistPlan = parsePagePlan({ ...plan, outcome: "waitlist", boundObject: { type: "form", id: "waitlist-form" } });
const waitlistCompiled = compilePagePlan(waitlistPlan, { id: "waitlist-form", title: "Waitlist Form", formName: "Waitlist Form" });
assert.equal(waitlistCompiled.content.at(-1)?.type, "Section");
assert.equal((waitlistCompiled.content.at(-1)?.props as { rows?: unknown[] })?.rows !== undefined, true);
assert.match(JSON.stringify(waitlistCompiled), /waitlist-form/);
assert.equal(pageTypeForOutcome("sell_offer").pageType, "sales");
assert.equal(pageTypeForOutcome("collect_leads").pageType, "landing");
assert.throws(() => parsePagePlan({ ...plan, outcome: "unknown" }));
assert.throws(() => parsePagePlan({ ...plan, sections: [] }));
assert.equal(AI_PAGE_DEFAULT_MODEL, "anthropic/claude-sonnet-4.6");
assert.equal(AI_PAGE_MODEL, process.env.AI_PAGE_GENERATION_MODEL?.trim() || AI_PAGE_DEFAULT_MODEL);
assert.throws(() => assertSafePuck({ ...compiled, content: [{ type: "Evil", props: { id: "evil" } }] } as never));
assert.throws(() => assertSafePuck({ ...compiled, content: [{ type: "Button", props: { id: "button", action: { type: "url", url: "javascript:alert(1)" } } }] } as never));
const generated = parseGeneratedPagePlan({ sections: [
  { role: "hero", heading: "A clear start", body: "A grounded invitation." },
  { role: "closing", heading: "Take the next step", body: "Choose the action that fits.", ctaLabel: "Continue" },
], cta: { label: "Continue" } }, "something_else");
assertPagePlanProofPolicy(generated, new Set());
assert.throws(() => assertPagePlanProofPolicy(parseGeneratedPagePlan({ sections: [
  { role: "testimonial", heading: "Clients love it", body: "Trusted by many." },
  { role: "closing", heading: "Continue", body: "Take the next step." },
], cta: { label: "Continue" } }, "sell_offer"), new Set()));
const eventCompiled = compilePagePlan(parsePagePlan({ ...plan, outcome: "registration" }), { id: "webinar-1", title: "Event", eventDetails: "Event: Event\nStarts: Monday\nTimezone: America/New_York", href: "/webinar/sa/event" });
assert.match(JSON.stringify(eventCompiled), /America\/New_York/);
console.log("AI PagePlan/compiler checks passed.");
