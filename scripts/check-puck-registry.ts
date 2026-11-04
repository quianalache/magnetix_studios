/**
 * Runtime New Builder registry contract.
 *
 * This intentionally imports the client config used by editor-shell.tsx,
 * rather than checking source text, so missing category/component wiring fails
 * before a production deployment.
 *
 * Run with: pnpm exec tsx scripts/check-puck-registry.ts
 */
import assert from "node:assert/strict";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { KNOWN_PUCK_BLOCK_TYPES } from "../src/lib/pages-funnels/puck/known-blocks";

const categories = clientPuckConfig.categories ?? {};
const elements = categories.elements?.components ?? [];
const dataMetrics = categories.dataMetrics?.components ?? [];
const business = categories.business?.components ?? [];
const components = clientPuckConfig.components ?? {};

const requiredElements = [
  "Icon",
  "Tabs",
  "ImageGallery",
  "ImageSlider",
  "LogoStrip",
  "Navigation",
] as const;
const requiredDataMetrics = [
  "Stats",
  "AnimatedCounter",
  "ProgressBar",
  "ProgressRing",
  "Chart",
] as const;
const requiredBusiness = ["Booking", "PricingComparison", "Testimonial", "Countdown", "OfferSummary"] as const;

for (const name of requiredElements) {
  assert.ok(elements.includes(name), `elements category is missing ${name}`);
  assert.ok(name in components, `component registry is missing ${name}`);
}
for (const name of requiredDataMetrics) {
  assert.ok(
    dataMetrics.includes(name),
    `dataMetrics category is missing ${name}`
  );
  assert.ok(name in components, `component registry is missing ${name}`);
}
for (const name of requiredBusiness) {
  assert.ok(business.includes(name), `business category is missing ${name}`);
  assert.ok(name in components, `component registry is missing ${name}`);
}

assert.ok(
  !dataMetrics.includes("DataTable") && !("DataTable" in components),
  "Data Table must not be exposed yet"
);

// Unknown-block safety guard: the recognised list must be exactly the registry,
// or valid pages would be refused (missing entry) / unknown ones accepted (extra).
assert.deepEqual(
  [...KNOWN_PUCK_BLOCK_TYPES].sort(),
  Object.keys(components).sort(),
  "KNOWN_PUCK_BLOCK_TYPES (lib/pages-funnels/puck/known-blocks.ts) must list exactly the registered blocks"
);

console.log(
  `PASS: client New Builder registry exposes ${requiredElements.length + requiredDataMetrics.length + requiredBusiness.length} native blocks (Wave 1 + Data & Metrics + Navigation + Booking + Pricing)`
);
