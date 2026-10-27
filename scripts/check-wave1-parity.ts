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
import { hasLogoSource, logoSizeLimits } from "../src/lib/pages-funnels/puck/logo";
import {
  timezoneDisplayLabel,
  timezoneSearchText,
} from "../src/lib/pages-funnels/puck/timezone-labels";

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
assert.equal(hasLogoSource([{ src: "" }, { src: "  " }]), false);
assert.equal(hasLogoSource([{ src: "logo.png" }]), true);
const eastern = timezoneDisplayLabel("America/New_York", new Date("2026-01-15T00:00:00Z"));
assert.match(eastern, /Eastern Time — New York/);
assert.match(eastern, /UTC−05:00|UTC-05:00/);
assert.match(timezoneSearchText("America/New_York", eastern), /eastern/);
console.log("Wave 1 parity checks passed");
