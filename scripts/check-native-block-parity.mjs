import fs from "node:fs";

const config = fs.readFileSync("src/components/pages-funnels/puck/config.tsx", "utf8");
const icons = fs.readFileSync("src/components/pages-funnels/puck/block-icons.tsx", "utf8");
const resolve = fs.readFileSync("src/lib/pages-funnels/puck/resolve.ts", "utf8");
const panel = fs.readFileSync("src/components/pages-funnels/puck/blocks-panel.tsx", "utf8");
const required = ["Icon", "Tabs", "ImageGallery", "ImageSlider", "Testimonial", "LogoStrip", "Stats", "Countdown", "OfferSummary"];
for (const name of required) {
  if (!config.includes(`"${name}"`)) throw new Error(`Missing registry/category entry: ${name}`);
  if (!icons.includes(`${name}:`)) throw new Error(`Missing block icon: ${name}`);
}
if (!config.includes("OfferSummary")) throw new Error("Offer Summary is not registered");
if (!resolve.includes("collectPuckOfferSummaryIds")) throw new Error("Offer Summary binding collector is missing");
if (!panel.includes("readingResult ? READING_RESULT_CATEGORY_ORDER")) throw new Error("Reading Result category routing is missing");
for (const name of ["AnimatedCounter", "ProgressBar", "ProgressRing", "Chart"]) {
  if (!icons.includes(`${name}:`)) throw new Error(`Missing block icon: ${name}`);
}
if (!config.includes('"AnimatedCounter",\n              "ProgressBar",\n              "ProgressRing",\n              "Chart",')) throw new Error("Data & Metrics blocks are not allowed inside Column");
console.log(`✓ Native Builder parity contract passed — ${required.length} Wave 1 blocks registered, categorized, icon-mapped, and Offer-bound.`);
