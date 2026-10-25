import assert from "node:assert/strict";
import { compilePagePlan, pageTypeForOutcome, parsePagePlan } from "../src/lib/pages-funnels/ai/page-plan";

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
assert.equal(compiled.content.length, 2);
assert.equal((compiled.content[0] as { type: string }).type, "Section");
assert.equal(pageTypeForOutcome("sell_offer").pageType, "sales");
assert.equal(pageTypeForOutcome("collect_leads").pageType, "landing");
assert.throws(() => parsePagePlan({ ...plan, outcome: "unknown" }));
assert.throws(() => parsePagePlan({ ...plan, sections: [] }));
console.log("AI PagePlan/compiler checks passed.");
