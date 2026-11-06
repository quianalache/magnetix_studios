import assert from "node:assert/strict";
import { mergeClassroomCoursePool } from "../src/lib/community/community-classroom-course-pool";
import { resolveMemberAccess } from "../src/lib/community/membership-access";
import type { MembershipLevel } from "../src/types/community-membership";

const native = Array.from({ length: 6 }, (_, i) => ({ id: `native-${i}`, title: `Native ${i}`, published: true }));
const linked = [
  { id: "linked-published", title: "Linked Published", published: true },
  { id: "linked-draft", title: "Linked Draft", published: false },
];
const pool = mergeClassroomCoursePool(native, linked);

assert.equal(pool.length, 8, "only the Community Classroom pool is returned");
assert.equal(pool.some((course) => course.id === "unrelated-sub-account-course"), false, "unrelated sub-account courses are excluded");
assert.equal(pool.some((course) => course.id === "linked-draft" && !course.published), true, "unpublished Classroom courses remain selectable");
assert.equal(pool.some((course) => course.id === "linked-published" && course.published), true, "published linked courses are selectable");
assert.equal(pool.some((course) => course.id === "native-0"), true, "native Community courses are selectable");
assert.equal(pool.some((course) => course.id === "linked-published"), true, "linked standalone Classroom courses are selectable");
assert.equal(pool.some((course) => course.id === "other-community-course"), false, "another Community's course is excluded");
assert.equal(mergeClassroomCoursePool([{ id: "same", title: "Same", published: true }], [{ id: "same", title: "Same", published: true }]).length, 1, "duplicate linkage is deduplicated");

const level = {
  id: "premium",
  subAccountId: "sa",
  groupId: "group",
  name: "Premium",
  description: "",
  isBase: false,
  status: "active" as const,
  offerId: "offer",
  order: 1,
  access: {
    channels: { mode: "selected" as const, ids: ["channel-1"] },
    courses: { mode: "selected" as const, ids: ["native-0"] },
  },
  createdAtMs: 0,
  updatedAtMs: 0,
  createdByUid: null,
  updatedByUid: null,
} satisfies MembershipLevel;
const resolved = resolveMemberAccess([level], ["premium"]);
assert.deepEqual([...resolved.courses], ["native-0"], "selected Classroom course access stays scoped");
assert.equal(resolved.events, "all", "historical Membership Level event fields no longer gate events");

console.log("Community membership access correction checks: 10 passed");
