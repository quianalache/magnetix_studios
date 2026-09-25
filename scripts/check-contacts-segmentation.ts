/**
 * Controlled, Firebase-free checks for the Contacts redesign's pure logic
 * (2026-09-25): the shared segmentation evaluator (existing ops unchanged +
 * new date / access ops), the condition-group sanitizer, and the name
 * compatibility helpers. No network, no Firestore, no production data.
 *
 *   pnpm exec tsx scripts/check-contacts-segmentation.ts
 */
import assert from "node:assert/strict";
import {
  evalConditionGroup,
  groupUsesAccessConditions,
  toEpochMs,
} from "../src/lib/segmentation/eval-condition-group";
import { sanitizeConditionGroup } from "../src/lib/segmentation/sanitize-group";
import {
  composeName,
  contactDisplayName,
  contactFirstName,
  contactLastName,
  resolveNameForWrite,
  suggestNameSplit,
} from "../src/lib/contacts/names";
import { contactMergeFields } from "../src/lib/server/contact-merge-fields";
import type { Contact } from "../src/types/contacts";
import type { ConditionGroup } from "../src/types/workflows";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0); // 2026-09-25T12:00Z

function contact(p: Partial<Contact>): Contact {
  return {
    id: "c1",
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    source: "",
    tags: [],
    pipelineStage: null,
    attribution: null,
    agencyId: "a",
    subAccountId: "s",
    createdByUid: "u",
    emailOptedOut: false,
    smsOptedOut: false,
    countryCode: null,
    country: null,
    city: null,
    lat: null,
    lng: null,
    createdAt: null,
    updatedAt: null,
    ...p,
  } as Contact;
}

// Firestore-Timestamp-shaped value (client + Admin SDK both expose toDate).
const ts = (ms: number) => ({ toDate: () => new Date(ms), seconds: Math.floor(ms / 1000) });

console.log("Segmentation evaluator — existing behavior");
check("empty group matches everything", () => {
  assert.equal(evalConditionGroup(undefined, contact({})), true);
  assert.equal(evalConditionGroup({ all: [] }, contact({})), true);
});
check("has_tag / not_has_tag / source_is / contains unchanged", () => {
  const c = contact({ tags: ["vip"], source: "community", company: "Acme Studio" });
  assert.equal(evalConditionGroup({ all: [{ field: "tags", op: "has_tag", value: "vip" }] }, c), true);
  assert.equal(evalConditionGroup({ all: [{ field: "tags", op: "not_has_tag", value: "vip" }] }, c), false);
  assert.equal(evalConditionGroup({ all: [{ field: "source", op: "source_is", value: "community" }] }, c), true);
  assert.equal(evalConditionGroup({ all: [{ field: "company", op: "contains", value: "acme" }] }, c), true);
});
check("match any = OR, default = AND", () => {
  const c = contact({ tags: ["a"] });
  const conds = [
    { field: "tags", op: "has_tag" as const, value: "a" },
    { field: "tags", op: "has_tag" as const, value: "b" },
  ];
  assert.equal(evalConditionGroup({ all: conds }, c), false);
  assert.equal(evalConditionGroup({ all: conds, match: "any" }, c), true);
});
check("customFields path still resolves", () => {
  const c = contact({ customFields: { plan: "gold" } });
  assert.equal(evalConditionGroup({ all: [{ field: "customFields.plan", op: "equals", value: "gold" }] }, c), true);
});

console.log("Segmentation evaluator — date operators");
check("toEpochMs handles Timestamp, Date, ISO, number, null", () => {
  assert.equal(toEpochMs(ts(NOW)), NOW);
  assert.equal(toEpochMs(new Date(NOW)), NOW);
  assert.equal(toEpochMs("2026-09-25T12:00:00.000Z"), NOW);
  assert.equal(toEpochMs(NOW), NOW);
  assert.equal(toEpochMs(null), null);
  assert.equal(toEpochMs("not a date"), null);
});
check("within_last_days / more_than_days_ago", () => {
  const recent = contact({ createdAt: ts(NOW - 3 * DAY) as never });
  const old = contact({ createdAt: ts(NOW - 40 * DAY) as never });
  const g7: ConditionGroup = { all: [{ field: "createdAt", op: "within_last_days", value: "7" }] };
  const g30: ConditionGroup = { all: [{ field: "createdAt", op: "more_than_days_ago", value: "30" }] };
  assert.equal(evalConditionGroup(g7, recent, { now: NOW }), true);
  assert.equal(evalConditionGroup(g7, old, { now: NOW }), false);
  assert.equal(evalConditionGroup(g30, old, { now: NOW }), true);
  assert.equal(evalConditionGroup(g30, recent, { now: NOW }), false);
});
check("before / after use whole UTC days", () => {
  const onSep3 = contact({ createdAt: ts(Date.UTC(2026, 8, 3, 15)) as never });
  const after = (d: string): ConditionGroup => ({ all: [{ field: "createdAt", op: "after", value: d }] });
  const before = (d: string): ConditionGroup => ({ all: [{ field: "createdAt", op: "before", value: d }] });
  assert.equal(evalConditionGroup(after("2026-09-03"), onSep3), false, "after excludes the day itself");
  assert.equal(evalConditionGroup(after("2026-09-02"), onSep3), true);
  assert.equal(evalConditionGroup(before("2026-09-03"), onSep3), false, "before excludes the day itself");
  assert.equal(evalConditionGroup(before("2026-09-04"), onSep3), true);
});
check("date ops never match a missing date or malformed value", () => {
  const none = contact({});
  assert.equal(evalConditionGroup({ all: [{ field: "createdAt", op: "within_last_days", value: "7" }] }, none, { now: NOW }), false);
  const c = contact({ createdAt: ts(NOW) as never });
  assert.equal(evalConditionGroup({ all: [{ field: "createdAt", op: "after", value: "09/03/2026" }] }, c), false);
  assert.equal(evalConditionGroup({ all: [{ field: "createdAt", op: "within_last_days", value: "-3" }] }, c, { now: NOW }), false);
});
check("custom date fields (yyyy-mm-dd strings) work", () => {
  const c = contact({ customFields: { renewal: "2026-10-01" } });
  assert.equal(evalConditionGroup({ all: [{ field: "customFields.renewal", op: "after", value: "2026-09-30" }] }, c), true);
});

console.log("Segmentation evaluator — access operators");
const accessGroup = (op: "has_access" | "not_has_access"): ConditionGroup => ({
  all: [{ field: "access", op, value: "offer:o1" }],
});
check("without an access index both access ops are false (no guessing)", () => {
  const c = contact({ id: "c1" });
  assert.equal(evalConditionGroup(accessGroup("has_access"), c), false);
  assert.equal(evalConditionGroup(accessGroup("not_has_access"), c), false);
});
check("with an index: has / doesn't have", () => {
  const idx = new Map([["offer:o1", new Set(["c1"])]]);
  assert.equal(evalConditionGroup(accessGroup("has_access"), contact({ id: "c1" }), { accessIndex: idx }), true);
  assert.equal(evalConditionGroup(accessGroup("has_access"), contact({ id: "c2" }), { accessIndex: idx }), false);
  assert.equal(evalConditionGroup(accessGroup("not_has_access"), contact({ id: "c2" }), { accessIndex: idx }), true);
});
check("tag AND purchased-offer example from the brief", () => {
  const idx = new Map([["offer:o1", new Set(["c1", "c3"])]]);
  const g: ConditionGroup = {
    all: [
      { field: "tags", op: "has_tag", value: "vip" },
      { field: "access", op: "has_access", value: "offer:o1" },
    ],
  };
  assert.equal(evalConditionGroup(g, contact({ id: "c1", tags: ["vip"] }), { accessIndex: idx }), true);
  assert.equal(evalConditionGroup(g, contact({ id: "c3", tags: [] }), { accessIndex: idx }), false);
  assert.equal(evalConditionGroup(g, contact({ id: "c2", tags: ["vip"] }), { accessIndex: idx }), false);
  assert.equal(groupUsesAccessConditions(g), true);
});

console.log("Condition-group sanitizer");
check("accepts a valid group and drops values on no-value ops", () => {
  const r = sanitizeConditionGroup({
    match: "any",
    all: [
      { field: "tags", op: "has_tag", value: " vip " },
      { field: "email", op: "is_set", value: "ignored" },
    ],
  });
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.group, {
      match: "any",
      all: [
        { field: "tags", op: "has_tag", value: "vip" },
        { field: "email", op: "is_set" },
      ],
    });
  }
});
check("rejects unknown ops, bad fields, missing values, oversized groups", () => {
  assert.equal(sanitizeConditionGroup({ all: [{ field: "tags", op: "drop_table", value: "x" }] }).ok, false);
  assert.equal(sanitizeConditionGroup({ all: [{ field: "__proto__.x", op: "equals", value: "x" }] }).ok, false);
  assert.equal(sanitizeConditionGroup({ all: [{ field: "tags", op: "has_tag", value: "" }] }).ok, false);
  assert.equal(sanitizeConditionGroup({ all: [{ field: "email", op: "has_access", value: "offer:1" }] }).ok, false);
  const many = Array.from({ length: 26 }, () => ({ field: "tags", op: "has_tag", value: "a" }));
  assert.equal(sanitizeConditionGroup({ all: many }).ok, false);
});
check("null means no filters", () => {
  const r = sanitizeConditionGroup(null);
  assert.ok(r.ok && r.group.all.length === 0);
});

console.log("Name compatibility");
check("explicit name always wins; otherwise compose from parts", () => {
  assert.equal(resolveNameForWrite({ name: "Mary Ann van der Berg", firstName: "M", lastName: "B" }), "Mary Ann van der Berg");
  assert.equal(resolveNameForWrite({ name: "  ", firstName: "Jo", lastName: "Doe" }), "Jo Doe");
  assert.equal(resolveNameForWrite({ firstName: "Cher" }), "Cher");
  assert.equal(composeName("", ""), "");
});
check("display / first / last fall back to the legacy full name", () => {
  const legacy = { name: "Hannah Becker" };
  assert.equal(contactFirstName(legacy), "Hannah");
  assert.equal(contactLastName(legacy), "Becker");
  assert.equal(contactFirstName({ name: "Hannah Becker", firstName: "Hanna" }), "Hanna");
  assert.equal(contactDisplayName({ name: "", firstName: "Kiki" }), "Kiki");
  assert.equal(contactDisplayName({ name: "", email: "a@b.co" }), "a@b.co");
  assert.equal(contactLastName({ name: "Kiki" }), "");
});
check("suggested split is only a suggestion (first space)", () => {
  assert.deepEqual(suggestNameSplit("Mary Ann Smith"), { firstName: "Mary", lastName: "Ann Smith" });
  assert.deepEqual(suggestNameSplit("Kiki"), { firstName: "Kiki", lastName: "" });
});

console.log("Contact merge — new fields");
const merge = (s: Partial<Contact>, l: Partial<Contact>) => contactMergeFields(contact(s), contact(l));
check("state / postal code fill only when the survivor's are blank", () => {
  assert.equal(merge({ state: "" }, { state: "TX" }).state, "TX");
  assert.equal(merge({}, { postalCode: "78701" }).postalCode, "78701");
  const kept = merge({ state: "CA", postalCode: "90210" }, { state: "TX", postalCode: "78701" });
  assert.equal(kept.state, undefined);
  assert.equal(kept.postalCode, undefined);
});
check("first/last name follow the surviving full name, never mixed", () => {
  // Different people's names — the survivor's name stays, so the other
  // record's parts must not be borrowed.
  const mixed = merge({ name: "Jane Doe" }, { name: "Bob Smith", firstName: "Bob", lastName: "Smith" });
  assert.equal(mixed.firstName, undefined);
  assert.equal(mixed.lastName, undefined);
  // Same full name — borrow the structured parts.
  const same = merge({ name: "Jane Doe" }, { name: "jane doe", firstName: "Jane", lastName: "Doe" });
  assert.deepEqual([same.firstName, same.lastName], ["Jane", "Doe"]);
  // Survivor has no name — its name comes from the other record, and so do the parts.
  const blank = merge({ name: "" }, { name: "Bob Smith", firstName: "Bob", lastName: "Smith" });
  assert.deepEqual([blank.name, blank.firstName, blank.lastName], ["Bob Smith", "Bob", "Smith"]);
  // Survivor already has parts — never overwritten.
  const own = merge({ name: "Jane Doe", firstName: "J" }, { name: "Jane Doe", firstName: "Jane", lastName: "Doe" });
  assert.equal(own.firstName, undefined);
  assert.equal(own.lastName, undefined);
});
check("opt-outs still stick from either record", () => {
  assert.equal(merge({ smsOptedOut: false }, { smsOptedOut: true }).smsOptedOut, true);
});

console.log(`\n${passed} checks passed.`);
