import assert from "node:assert/strict";
import { resolveEffectiveBaseRoster, type EffectiveMembershipRecord } from "../src/lib/community/membership-roster";
import type { MembershipLevel } from "../src/types/community-membership";

const level = (id: string, isBase = false, status: "active" | "inactive" = "active"): MembershipLevel => ({
  id,
  subAccountId: "sa",
  groupId: "group",
  name: id,
  description: "",
  isBase,
  status,
  offerId: null,
  order: 0,
  access: {
    channels: { mode: "all", ids: [] },
    courses: { mode: "all", ids: [] },
  },
  createdAtMs: 0,
  updatedAtMs: 0,
  createdByUid: null,
  updatedByUid: null,
});

const members: EffectiveMembershipRecord[] = [
  { memberId: "base-a", status: "active", levelIds: [] },
  { memberId: "base-b", status: "active", levelIds: [] },
  { memberId: "manual", status: "active", levelIds: ["vip"] },
  { memberId: "offer", status: "active", levelIds: ["premium"] },
  { memberId: "inactive", status: "inactive", levelIds: [] },
];
const identities = new Map([
  ["base-a", { memberId: "base-a", name: "Base A", email: "a@example.com" }],
  ["base-b", { memberId: "base-b", name: "Base B", email: "b@example.com" }],
  ["manual", { memberId: "manual", name: "Manual", email: "manual@example.com" }],
  ["offer", { memberId: "offer", name: "Offer", email: "offer@example.com" }],
]);

const roster = resolveEffectiveBaseRoster(members, [level("base", true), level("vip"), level("premium")], identities);
assert.equal(roster.length, 2, "active members without non-base grants appear");
assert.deepEqual(roster.map((member) => member.memberId), ["base-a", "base-b"]);
assert.equal(roster.some((member) => member.memberId === "manual"), false, "manual non-base member leaves Base roster");
assert.equal(roster.some((member) => member.memberId === "offer"), false, "Offer-backed non-base member leaves Base roster");
assert.equal(roster.some((member) => member.memberId === "inactive"), false, "inactive membership is excluded");
assert.equal(new Set(roster.map((member) => member.memberId)).size, roster.length, "Base roster has no duplicates");
assert.equal(roster.every((member) => member.source === "base" && member.grantId === null), true);
assert.equal(roster.every((member) => member.source === "base"), true, "Base source is explicit");
assert.equal(roster.every((member) => member.grantId === null), true, "Base rows have no removable grant");
assert.deepEqual(roster.map((member) => member.name), ["Base A", "Base B"], "Base roster is sorted");
assert.deepEqual(
  resolveEffectiveBaseRoster(members.slice(0, 2), [], identities).map((member) => member.memberId),
  ["base-a", "base-b"],
);
console.log("Community membership roster checks: 10 passed");
