import assert from "node:assert/strict";
import {
  getCountdownState,
  joinCountdownTarget,
  parseCountdownTarget,
  splitCountdownTarget,
} from "../src/lib/pages-funnels/puck/countdown";
import {
  clampSliderIntervalMs,
  sliderIntervalMsToSeconds,
  sliderIntervalSecondsToMs,
} from "../src/lib/pages-funnels/puck/slider";
import {
  clampLogoHeight,
  hasLogoSource,
  logoHeightForLegacySize,
  logoSizeLimits,
} from "../src/lib/pages-funnels/puck/logo";
import {
  timezoneDisplayLabel,
  timezoneSearchText,
} from "../src/lib/pages-funnels/puck/timezone-labels";
import {
  formatMetricValue,
  metricItemSummary,
} from "../src/lib/pages-funnels/data-metrics/formatting";
import { parseMetricNumber } from "../src/lib/pages-funnels/data-metrics/validation";

const target = joinCountdownTarget("2030-04-05", "14:30");
assert.equal(target, "2030-04-05T14:30");
assert.deepEqual(splitCountdownTarget(target), {
  date: "2030-04-05",
  time: "14:30",
});
assert.equal(getCountdownState("", Date.now()), "unconfigured");
assert.equal(
  getCountdownState(target, parseCountdownTarget(target, "UTC") - 1, "UTC"),
  "active"
);
assert.equal(
  getCountdownState(target, parseCountdownTarget(target, "UTC") + 1, "UTC"),
  "expired"
);
assert.equal(sliderIntervalSecondsToMs(5), 5000);
assert.equal(sliderIntervalMsToSeconds(5000), 5);
assert.equal(sliderIntervalSecondsToMs(1), 3000);
assert.equal(sliderIntervalSecondsToMs(90), 60000);
assert.equal(clampSliderIntervalMs(10499), 10000);
assert.deepEqual(logoSizeLimits("medium"), { maxHeight: 64, maxWidth: 208 });
assert.equal(clampLogoHeight(undefined), 96);
assert.equal(clampLogoHeight(12), 48);
assert.equal(clampLogoHeight(999), 240);
assert.equal(logoHeightForLegacySize("small"), 64);
assert.equal(logoHeightForLegacySize("large"), 128);
assert.equal(hasLogoSource([{ src: "" }, { src: "  " }]), false);
assert.equal(hasLogoSource([{ src: "logo.png" }]), true);
const eastern = timezoneDisplayLabel(
  "America/New_York",
  new Date("2026-01-15T00:00:00Z")
);
assert.match(eastern, /Eastern Time — New York/);
assert.match(eastern, /UTC−05:00|UTC-05:00/);
assert.match(timezoneSearchText("America/New_York", eastern), /eastern/);
assert.equal(
  formatMetricValue("1200", { format: "compact", decimalPlaces: 1 }),
  "1.2K"
);
assert.equal(
  formatMetricValue("98", { format: "percentage", decimalPlaces: 0 }),
  "98%"
);
assert.equal(
  formatMetricValue("1234.5", { format: "number", decimalPlaces: 2 }),
  "1,234.50"
);
assert.equal(
  formatMetricValue("12.5", {
    format: "currency",
    currency: "USD",
    decimalPlaces: 2,
  }),
  "$12.50"
);
assert.equal(formatMetricValue("10K+", { format: "number" }), "10K+");
assert.equal(
  formatMetricValue("Over 1,000", { format: "number" }),
  "Over 1,000"
);
assert.equal(parseMetricNumber("Over 1,000"), null);
assert.equal(
  metricItemSummary("10K+", "Students served"),
  "10K+ — Students served"
);
console.log("Wave 1 parity checks passed");
