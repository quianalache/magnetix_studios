import assert from "node:assert/strict";
import {
  getCountdownState,
  joinCountdownTarget,
  parseCountdownTarget,
  splitCountdownTarget,
} from "../src/lib/pages-funnels/puck/countdown";

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
console.log("Wave 1 parity checks passed");
