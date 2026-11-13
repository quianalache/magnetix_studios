/**
 * Contacts & Tags (2026-11) — checks against the Firestore EMULATOR:
 * tag-name rules, the registry, the shared tag writer (registry spelling,
 * events only on real changes, activity, loop guard), the library counts,
 * usage discovery across workflows / forms / checkouts / Reading Tools /
 * broadcast drafts / contact lists, rename, merge, delete (incl. the
 * condition guard and stale-confirmation refusal) and workspace isolation.
 * No network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore --project demo-tags \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-contact-tags.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= PROJECT;
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID"]) delete process.env[k];

const SA = "sa_tags";
const SA2 = "sa_tags_other";
const AG = "ag_tags";
const UID = "admin_uid";
let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 3).join("\n       ")}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 4000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!ok(v) && Date.now() < end) {
    await sleep(100);
    v = await fn();
  }
  return v;
}

async function main() {
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const names = await import("../src/lib/contacts/tag-names");
  const registry = await import("../src/lib/server/contact-tags/registry");
  const writer = await import("../src/lib/server/contact-tags/tag-writer");
  const service = await import("../src/lib/server/contact-tags/service");
  const contacts = await import("../src/lib/server/contacts-service");
  const { evalConditionGroup } = await import("../src/lib/segmentation/eval-condition-group");
  const db = getAdminDb();
  const isErr = (status: number, code?: string) => (e: unknown) =>
    e instanceof service.TagServiceError && e.status === status && (!code || e.code === code);

  await db.doc(`subAccounts/${SA}`).set({ name: "Tags QA", agencyId: AG });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag_other" });
  const mkContact = async (id: string, tags: string[], sa = SA) =>
    db.doc(`contacts/${id}`).set({ name: id, email: `${id}@example.com`, tags, subAccountId: sa, agencyId: sa === SA ? AG : "ag_other", mode: "live", territoryId: "global", createdAt: new Date(), updatedAt: new Date() });
  const tagsOf = async (id: string) => ((await db.doc(`contacts/${id}`).get()).get("tags") as string[]) ?? [];
  const runsFor = async (wfId: string) => (await db.collection("workflowRuns").where("workflowId", "==", wfId).get()).docs;
  const activities = async (id: string) => (await db.collection(`contacts/${id}/activities`).get()).docs.map((d) => d.data());

  console.log("Tag names");
  await check("clean / key / loose key", async () => {
    assert.equal(names.cleanTagName("  VIP   Customer "), "VIP Customer");
    assert.equal(names.tagKey("VIP  customer"), names.tagKey("vip Customer"));
    assert.equal(names.looseTagKey("vip-customer"), names.looseTagKey("VIP Customer"));
  });
  await check("validation: empty, too long, comma", async () => {
    assert.equal(names.validateTagName("  ").ok, false);
    assert.equal(names.validateTagName("x".repeat(51)).ok, false);
    assert.equal(names.validateTagName("a,b").ok, false);
    assert.deepEqual(names.validateTagName(" Lead  Magnet "), { ok: true, name: "Lead Magnet" });
  });
  await check("has_tag matches regardless of capitalization / spaces", async () => {
    const c = { id: "x", tags: ["VIP Customer"] } as never;
    assert.equal(evalConditionGroup({ all: [{ field: "tags", op: "has_tag", value: "vip  customer" }] }, c), true);
    assert.equal(evalConditionGroup({ all: [{ field: "tags", op: "not_has_tag", value: "VIP customer" }] }, c), false);
  });

  console.log("Registry + create");
  let vipId = "";
  await check("create a tag with zero contacts", async () => {
    const tag = await service.createTag({ subAccountId: SA, agencyId: AG, name: " VIP ", uid: UID });
    vipId = tag.id;
    assert.equal(tag.name, "VIP");
    const list = await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true });
    const row = list.tags.find((t) => t.id === vipId)!;
    assert.equal(row.contactCount, 0);
    assert.equal(row.registered, true);
  });
  await check("duplicate name refused (case / spaces), points to the existing tag", async () => {
    await assert.rejects(service.createTag({ subAccountId: SA, agencyId: AG, name: "vip", uid: UID }), (e) => isErr(409, "exists")(e) && (e as InstanceType<typeof service.TagServiceError>).extra.tagId === vipId);
  });
  await check("invalid names refused", async () => {
    await assert.rejects(service.createTag({ subAccountId: SA, agencyId: AG, name: "", uid: UID }), isErr(400, "invalid_name"));
    await assert.rejects(service.createTag({ subAccountId: SA, agencyId: AG, name: "a,b", uid: UID }), isErr(400, "invalid_name"));
  });

  console.log("Tag writer");
  await mkContact("c1", []);
  await check("writer uses the registry spelling and registers new tags", async () => {
    const res = await writer.applyContactTags({ subAccountId: SA, contactId: "c1", add: ["vip", "Newsletter"], ctx: { source: "form", sourceId: "form1" } });
    assert.deepEqual(res?.added, ["VIP", "Newsletter"]);
    assert.deepEqual(await tagsOf("c1"), ["VIP", "Newsletter"]);
    assert.ok(await registry.findTagByName(SA, "newsletter"));
  });
  await check("no change → no event, no activity", async () => {
    const before = (await activities("c1")).length;
    const res = await writer.applyContactTags({ subAccountId: SA, contactId: "c1", add: ["VIP"], remove: ["missing"], ctx: { source: "form" } });
    assert.deepEqual(res?.added, []);
    assert.deepEqual(res?.removed, []);
    await sleep(300);
    assert.equal((await activities("c1")).length, before);
  });
  await check("activity rows carry tag + source", async () => {
    const rows = await waitFor(() => activities("c1"), (r) => r.filter((a) => a.type === "tag_added").length >= 2);
    const vip = rows.find((a) => a.type === "tag_added" && (a.meta as { tag?: string }).tag === "VIP")!;
    assert.equal((vip.meta as { tagSource?: string }).tagSource, "form");
    assert.match(String(vip.content), /Source: Form/);
  });
  await check("remove is case-insensitive and records Tag removed", async () => {
    const res = await writer.applyContactTags({ subAccountId: SA, contactId: "c1", remove: ["newsletter"], ctx: { source: "manual", actorUid: UID } });
    assert.deepEqual(res?.removed, ["Newsletter"]);
    const rows = await waitFor(() => activities("c1"), (r) => r.some((a) => a.type === "tag_removed"));
    assert.ok(rows.some((a) => a.type === "tag_removed"));
  });
  await check("foreign workspace contact refused", async () => {
    await mkContact("c_other", ["VIP"], SA2);
    assert.equal(await writer.applyContactTags({ subAccountId: SA, contactId: "c_other", add: ["x"], ctx: { source: "manual" } }), null);
  });
  await check("contact create canonicalizes + dedupes tags", async () => {
    const { id } = await contacts.createContactServerSide({
      subAccountId: SA, agencyId: AG, createdByUid: UID, mode: "live", name: "New", email: "new@example.com", phone: "", company: "", address: "", source: "manual",
      tags: ["vip", "VIP ", "Lead"], tagContext: { source: "manual", actorUid: UID },
    });
    assert.deepEqual(await tagsOf(id), ["VIP", "Lead"]);
  });

  console.log("Workflow events + loop safety");
  await db.doc("workflows/wf_tag").set({
    name: "On VIP", status: "active", subAccountId: SA, agencyId: AG, createdByUid: UID,
    trigger: { type: "contact.tag.added", filters: { all: [{ field: "tags", op: "has_tag", value: "VIP" }] } },
    startNodeId: "n1", nodes: { n1: { id: "n1", type: "add_tag", config: { tag: "Onboarded" }, next: null } },
  });
  await mkContact("c2", []);
  await check("Tag Added fires once for a real add, not for a repeat", async () => {
    await writer.applyContactTags({ subAccountId: SA, contactId: "c2", add: ["VIP"], ctx: { source: "checkout" } });
    const runs = await waitFor(() => runsFor("wf_tag"), (r) => r.length >= 1);
    assert.equal(runs.length, 1);
    await writer.applyContactTags({ subAccountId: SA, contactId: "c2", add: ["vip"], ctx: { source: "checkout" } });
    await sleep(500);
    assert.equal((await runsFor("wf_tag")).length, 1);
  });
  await check("a workflow's own tag change never re-enrolls it", async () => {
    await mkContact("c3", ["VIP"]);
    await writer.applyContactTags({
      subAccountId: SA, contactId: "c3", add: ["Onboarded"],
      ctx: { source: "workflow", workflow: { workflowId: "wf_tag", runId: "r1", chainDepth: 0 } },
    });
    await sleep(600);
    assert.equal((await runsFor("wf_tag")).filter((d) => d.get("contactId") === "c3").length, 0);
  });
  await check("chain depth cap stops tag cascades", async () => {
    await mkContact("c4", []);
    await writer.applyContactTags({
      subAccountId: SA, contactId: "c4", add: ["VIP"],
      ctx: { source: "workflow", workflow: { workflowId: "wf_elsewhere", runId: "r2", chainDepth: 4 } },
    });
    await sleep(600);
    assert.equal((await runsFor("wf_tag")).filter((d) => d.get("contactId") === "c4").length, 0);
  });

  console.log("Library + usage discovery");
  await mkContact("c5", ["vip"]); // spelling variant
  await mkContact("c6", ["Legacy Lead"]); // unregistered
  await db.doc("forms/f1").set({ name: "VIP form", subAccountId: SA, agencyId: AG, settings: { autoTags: ["VIP", "Legacy Lead"] } });
  for (let i = 0; i < 55; i++) await db.doc(`forms/fx${i}`).set({ name: `Form ${i}`, subAccountId: SA, agencyId: AG, settings: { autoTags: ["Bulk"] } });
  await db.doc("checkoutConfigs/step_s1").set({ subAccountId: SA, agencyId: AG, context: { type: "hosted_offer", offerId: "o1" }, crm: { startedTags: [], marketingOptIn: { tags: ["VIP"] }, abandoned: { tags: [] }, completed: { tags: ["Legacy Lead"] } } });
  await db.doc("embedConfigs/e1").set({ name: "Chart tool", subAccountId: SA, agencyId: AG, contact: { tags: ["Legacy Lead"] } });
  await db.doc("broadcasts/b1").set({ subAccountId: SA, agencyId: AG, status: "draft", subject: "Hello VIPs", audienceFilter: { kind: "conditions", group: { all: [{ field: "tags", op: "has_tag", value: "vip" }] } } });
  await db.doc("broadcasts/b2").set({ subAccountId: SA, agencyId: AG, status: "sent", subject: "Old", audienceFilter: { kind: "tag", tag: "VIP" } });
  await db.doc("contactLists/l1").set({ subAccountId: SA, agencyId: AG, name: "VIPs", group: { all: [{ field: "tags", op: "has_tag", value: "VIP" }] } });
  await db.doc("workflows/wf_other_sa").set({ name: "Other", status: "active", subAccountId: SA2, trigger: { type: "contact.created", filters: { all: [{ field: "tags", op: "has_tag", value: "VIP" }] } }, nodes: {} });

  await check("counts: contacts per tag (variants included) vs settings references", async () => {
    const list = await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true });
    const vip = list.tags.find((t) => t.id === vipId)!;
    // c1, new contact, c2, c3, c4, c5 (variant "vip")
    assert.equal(vip.contactCount, 6);
    assert.deepEqual(vip.variants, [{ name: "vip", contactCount: 1 }]);
    // wf_tag, f1, checkout, broadcast draft, list — never the sent broadcast or the other workspace
    assert.equal(vip.usageCount, 5);
    assert.deepEqual(vip.usageByType, { workflow: 1, form: 1, checkout: 1, broadcast_draft: 1, contact_list: 1 });
    const legacy = list.tags.find((t) => t.name === "Legacy Lead")!;
    assert.equal(legacy.registered, false);
    assert.equal(legacy.contactCount, 1);
    assert.equal(legacy.usageCount, 3);
    assert.ok(list.tags.some((t) => t.name === "Bulk" && t.contactCount === 0 && t.usageCount === 55));
  });
  await check("detail lists real items with links + bounded pages", async () => {
    const bulk = (await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((t) => t.name === "Bulk")!;
    const d = await service.getTagDetail({ subAccountId: SA, tagId: bulk.id, territoryIds: null, canManage: true });
    const forms = d.sections.find((s) => s.type === "form")!;
    assert.equal(forms.total, 55);
    assert.equal(forms.items.length, 50);
    assert.equal(forms.nextOffset, 50);
    const more = await service.getTagDetail({ subAccountId: SA, tagId: bulk.id, territoryIds: null, canManage: true, more: { type: "form", offset: 50 } });
    assert.equal(more.sections.find((s) => s.type === "form")!.items.length, 5);
    const vip = await service.getTagDetail({ subAccountId: SA, tagId: vipId, territoryIds: null, canManage: true });
    const wf = vip.sections.find((s) => s.type === "workflow")!.items[0];
    assert.equal(wf.href, `/sa/${SA}/workflows/wf_tag`);
    assert.deepEqual(wf.contexts, ["Trigger condition"]);
    assert.equal(vip.attentionReferenceCount, 3); // workflow condition, broadcast draft audience, list
  });
  await check("duplicate review groups spelling variants + look-alikes", async () => {
    await mkContact("c7", ["lead-magnet"]);
    await mkContact("c8", ["Lead Magnet"]);
    const groups = await service.listDuplicateGroups(SA, null);
    assert.ok(groups.some((g) => g.tags.map((t) => t.name).sort().join("|") === "Lead Magnet|lead-magnet"));
    assert.ok(groups.some((g) => g.tags.length === 1 && g.tags[0].name === "VIP"));
  });

  console.log("Rename");
  await check("rename collision points to Merge", async () => {
    await assert.rejects(service.renameTag({ subAccountId: SA, agencyId: AG, tagId: vipId, newName: "Lead", uid: UID }), isErr(409, "name_taken"));
  });
  await check("rename updates contacts + every setting; history untouched", async () => {
    const res = await service.renameTag({ subAccountId: SA, agencyId: AG, tagId: vipId, newName: "VIP Customer", uid: UID });
    assert.equal(res.tag.name, "VIP Customer");
    assert.deepEqual(await tagsOf("c5"), ["VIP Customer"]);
    assert.deepEqual(await tagsOf("c1"), ["VIP Customer"]);
    assert.deepEqual((await db.doc("forms/f1").get()).get("settings.autoTags"), ["VIP Customer", "Legacy Lead"]);
    assert.equal((await db.doc("workflows/wf_tag").get()).get("trigger.filters.all")[0].value, "VIP Customer");
    assert.deepEqual((await db.doc("checkoutConfigs/step_s1").get()).get("crm.marketingOptIn.tags"), ["VIP Customer"]);
    assert.equal((await db.doc("broadcasts/b1").get()).get("audienceFilter.group.all")[0].value, "VIP Customer");
    assert.equal((await db.doc("broadcasts/b2").get()).get("audienceFilter.tag"), "VIP"); // sent = history
    assert.equal((await db.doc("contactLists/l1").get()).get("group.all")[0].value, "VIP Customer");
    assert.equal((await db.doc("workflows/wf_other_sa").get()).get("trigger.filters.all")[0].value, "VIP"); // other workspace
    assert.deepEqual(await tagsOf("c_other"), ["VIP"]);
    const acts = await activities("c1");
    assert.ok(acts.some((a) => (a.meta as { tag?: string })?.tag === "VIP"), "old activity keeps the old name");
  });
  await check("stale writers sending the old name land on the renamed tag", async () => {
    await mkContact("c9", []);
    const res = await writer.applyContactTags({ subAccountId: SA, contactId: "c9", add: ["vip"], ctx: { source: "form" } });
    assert.deepEqual(res?.added, ["VIP Customer"]);
  });

  console.log("Merge");
  await check("merge look-alikes: kept tag replaces the other everywhere, no duplicates", async () => {
    await mkContact("c10", ["Lead Magnet", "lead-magnet"]);
    await db.doc("forms/f2").set({ name: "Magnet form", subAccountId: SA, agencyId: AG, settings: { autoTags: ["lead-magnet", "Lead Magnet"] } });
    const list = await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true });
    const keep = list.tags.find((t) => t.name === "Lead Magnet")!;
    const drop = list.tags.find((t) => t.name === "lead-magnet")!;
    await service.mergeTags({ subAccountId: SA, agencyId: AG, targetId: keep.id, sourceIds: [drop.id], uid: UID });
    assert.deepEqual(await tagsOf("c10"), ["Lead Magnet"]);
    assert.deepEqual(await tagsOf("c7"), ["Lead Magnet"]);
    assert.deepEqual((await db.doc("forms/f2").get()).get("settings.autoTags"), ["Lead Magnet"]);
    const after = await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true });
    assert.equal(after.tags.filter((t) => names.looseTagKey(t.name) === "leadmagnet").length, 1);
    const res = await writer.applyContactTags({ subAccountId: SA, contactId: "c9", add: ["lead-magnet"], ctx: { source: "form" } });
    assert.deepEqual(res?.added, ["Lead Magnet"]);
  });
  await check("merge is idempotent (running it again changes nothing)", async () => {
    const list = await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true });
    const keep = list.tags.find((t) => t.name === "Lead Magnet")!;
    await assert.rejects(service.mergeTags({ subAccountId: SA, agencyId: AG, targetId: keep.id, sourceIds: [], uid: UID }), isErr(400, "nothing_to_merge"));
  });

  console.log("Delete");
  await check("unconfirmed / stale confirmation refused", async () => {
    const legacy = (await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((t) => t.name === "Legacy Lead")!;
    await assert.rejects(service.deleteTag({ subAccountId: SA, tagId: legacy.id, uid: UID, confirmName: "Wrong", expectedReferenceCount: 3 }), isErr(400, "unconfirmed"));
    await assert.rejects(service.deleteTag({ subAccountId: SA, tagId: legacy.id, uid: UID, confirmName: "Legacy Lead", expectedReferenceCount: 2 }), isErr(409, "changed"));
  });
  await check("delete removes it from contacts + lists that apply it, nothing else", async () => {
    const legacy = (await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.find((t) => t.name === "Legacy Lead")!;
    await service.deleteTag({ subAccountId: SA, tagId: legacy.id, uid: UID, confirmName: "Legacy Lead", expectedReferenceCount: 3 });
    assert.deepEqual(await tagsOf("c6"), []);
    assert.deepEqual((await db.doc("forms/f1").get()).get("settings.autoTags"), ["VIP Customer"]);
    assert.deepEqual((await db.doc("checkoutConfigs/step_s1").get()).get("crm.completed.tags"), []);
    assert.deepEqual((await db.doc("embedConfigs/e1").get()).get("contact.tags"), []);
    assert.equal((await db.doc("embedConfigs/e1").get()).get("name"), "Chart tool");
    const ops = await service.recentOperations(SA);
    assert.equal(ops[0].type, "delete");
    assert.equal(ops[0].status, "completed");
  });
  await check("delete a registered, unused tag removes its definition + name", async () => {
    const t = await service.createTag({ subAccountId: SA, agencyId: AG, name: "Temp", uid: UID });
    await service.deleteTag({ subAccountId: SA, tagId: t.id, uid: UID, confirmName: "Temp", expectedReferenceCount: 0 });
    assert.equal(await registry.getRegistryTag(SA, t.id), null);
    assert.equal(await registry.findTagByName(SA, "temp"), null);
    const again = await service.createTag({ subAccountId: SA, agencyId: AG, name: "Temp", uid: UID });
    assert.notEqual(again.id, t.id);
  });

  console.log("Informed delete — rules kept, marked, fail closed");
  const engine = await import("../src/lib/workflows/engine");
  const validity = await import("../src/lib/contacts/tag-rule-validity");
  const audience = await import("../src/lib/broadcasts/audience");
  const voice = await import("../src/lib/comms/voice/audience");
  const crmRules = await import("../src/lib/checkout/crm");
  await service.createTag({ subAccountId: SA, agencyId: AG, name: "Doomed", uid: UID });
  await mkContact("d1", ["Doomed", "Keep"]);
  await mkContact("d2", ["Keep"]);
  await mkContact("d3", []);
  await db.doc("workflows/wf_del").set({
    name: "Uses Doomed", status: "active", subAccountId: SA, agencyId: AG, createdByUid: UID,
    trigger: { type: "contact.tag.added", filters: { all: [{ field: "tags", op: "has_tag", value: "Doomed" }] } },
    startNodeId: "n1",
    nodes: {
      n1: { id: "n1", type: "if_else", config: { conditions: { match: "any", all: [{ field: "tags", op: "not_has_tag", value: "doomed" }, { field: "tags", op: "has_tag", value: "Keep" }] } }, branches: { whenTrue: "n2", whenFalse: "n3" } },
      n2: { id: "n2", type: "add_tag", config: { tag: "Doomed" }, next: null },
      n3: { id: "n3", type: "remove_tag", config: { tag: "DOOMED" }, next: null },
      n4: { id: "n4", type: "create_contact", config: { tags: ["Doomed", "Keep"] }, next: null },
    },
  });
  await db.doc("contactLists/l_del").set({ subAccountId: SA, agencyId: AG, name: "Doomed or Keep", group: { match: "any", all: [{ field: "tags", op: "has_tag", value: "Doomed" }, { field: "tags", op: "has_tag", value: "Keep" }] } });
  await db.doc("broadcasts/b_del_tag").set({ subAccountId: SA, agencyId: AG, status: "draft", subject: "Tag audience", audienceFilter: { kind: "tag", tag: "doomed" } });
  await db.doc("broadcasts/b_del_not").set({ subAccountId: SA, agencyId: AG, status: "draft", subject: "Not audience", audienceFilter: { kind: "conditions", group: { all: [{ field: "tags", op: "not_has_tag", value: "Doomed" }] } } });
  const doomedId = () => service.listTags({ subAccountId: SA, territoryIds: null, canManage: true }).then((l) => l.tags.find((t) => t.name === "Doomed")!.id);

  await check("dialog data: references + how many will need attention", async () => {
    const d = await service.getTagDetail({ subAccountId: SA, tagId: await doomedId(), territoryIds: null, canManage: true });
    assert.equal(d.sections.reduce((n, s) => n + s.total, 0), 4); // workflow, list, two drafts
    assert.equal(d.attentionReferenceCount, 4);
  });
  await check("delete proceeds after confirmation even though rules use it", async () => {
    const res = await service.deleteTag({ subAccountId: SA, tagId: await doomedId(), uid: UID, confirmName: "Doomed", expectedReferenceCount: 4 });
    assert.equal(res.contactsUpdated, 1);
    assert.equal(res.referencesNeedingAttention, 4);
    assert.deepEqual(await tagsOf("d1"), ["Keep"]);
    assert.equal(await registry.findTagByName(SA, "doomed"), null);
  });
  await check("rules are kept with their value and marked (never removed)", async () => {
    const wf = (await db.doc("workflows/wf_del").get()).data()!;
    assert.equal(wf.trigger.filters.all[0].value, "Doomed");
    assert.equal(wf.trigger.filters.all[0].invalid.reason, "tag_deleted");
    assert.equal(wf.nodes.n1.config.conditions.all.length, 2);
    assert.ok(wf.nodes.n1.config.conditions.all[0].invalid);
    assert.equal(wf.nodes.n1.config.conditions.all[1].invalid, undefined);
    assert.ok(wf.nodes.n2.config.invalid && wf.nodes.n2.config.tag === "Doomed");
    assert.ok(wf.nodes.n3.config.invalid);
    assert.deepEqual(wf.nodes.n4.config.tags, ["Keep"]); // a list that only applies it
    const list = (await db.doc("contactLists/l_del").get()).data()!;
    assert.equal(list.group.all.length, 2);
    assert.ok(list.group.all[0].invalid);
    assert.ok((await db.doc("broadcasts/b_del_tag").get()).get("audienceFilter.invalid"));
    assert.ok((await db.doc("broadcasts/b_del_not").get()).get("audienceFilter.group.all")[0].invalid);
  });
  await check("fail closed: OR / NOT groups match nobody (never everyone)", async () => {
    const list = (await db.doc("contactLists/l_del").get()).data()!;
    for (const id of ["d1", "d2", "d3"]) {
      const c = { id, ...(await db.doc(`contacts/${id}`).get()).data() } as never;
      assert.equal(evalConditionGroup(list.group, c), false, `list for ${id}`);
      assert.equal(evalConditionGroup((await db.doc("broadcasts/b_del_not").get()).get("audienceFilter.group"), c), false, `not-group for ${id}`);
    }
  });
  await check("invalid trigger enrolls nobody", async () => {
    await writer.applyContactTags({ subAccountId: SA, contactId: "d2", add: ["Fresh"], ctx: { source: "manual" } });
    await sleep(700);
    assert.equal((await runsFor("wf_del")).length, 0);
  });
  const mkRun = async (id: string, contactId: string) =>
    db.doc(`workflowRuns/${id}`).set({ id, subAccountId: SA, agencyId: AG, workflowId: "wf_del", contactId, status: "running", currentNodeId: null, history: [], context: {}, qstashMessageId: null, enrolledAt: new Date(), updatedAt: new Date() });
  await check("If/else on a deleted tag stops the run (no branch taken)", async () => {
    await mkRun("run_if", "d2");
    await engine.runStep("run_if", "n1");
    const run = (await db.doc("workflowRuns/run_if").get()).data()!;
    assert.equal(run.status, "failed");
    assert.equal(run.history[0].execution.errorCategory, "configuration_required");
    assert.match(run.history[0].execution.errorMessage, /“doomed” was deleted/);
  });
  await check("Add Tag on a deleted tag stops the run and never recreates it", async () => {
    await mkRun("run_add", "d3");
    await engine.runStep("run_add", "n2");
    assert.equal((await db.doc("workflowRuns/run_add").get()).get("status"), "failed");
    assert.deepEqual(await tagsOf("d3"), []);
    assert.equal(await registry.findTagByName(SA, "Doomed"), null);
  });
  await check("broadcast audiences on a deleted tag refuse to resolve", async () => {
    await assert.rejects(audience.resolveAudience(SA, (await db.doc("broadcasts/b_del_tag").get()).get("audienceFilter")), audience.AudienceNeedsAttentionError);
    await assert.rejects(audience.resolveAudience(SA, (await db.doc("broadcasts/b_del_not").get()).get("audienceFilter")), audience.AudienceNeedsAttentionError);
    await assert.rejects(audience.resolveAudience(SA, { kind: "list", listId: "l_del" }), audience.AudienceNeedsAttentionError);
  });
  await check("a save that drops the marker keeps it; choosing another tag repairs it", async () => {
    const wf = (await db.doc("workflows/wf_del").get()).data()!;
    const stripped = JSON.parse(JSON.stringify(wf.trigger.filters).replace(/,"invalid":\{[^}]*\}/g, ""));
    assert.equal(stripped.all[0].invalid, undefined);
    assert.ok(validity.reconcileGroup(wf.trigger.filters, stripped).all[0].invalid, "carried");
    const repaired = { ...stripped, all: [{ ...wf.trigger.filters.all[0], value: "Keep" }] };
    assert.equal(validity.reconcileGroup(wf.trigger.filters, repaired).all[0].invalid, undefined);
    assert.equal(validity.groupNeedsAttention(validity.reconcileGroup(wf.trigger.filters, repaired)), false);
    const nodes = validity.reconcileNodes(wf.nodes, { ...wf.nodes, n2: { ...wf.nodes.n2, config: { tag: "Doomed" } } });
    assert.ok(nodes.n2.config.invalid, "step marker carried");
    const fixed = validity.reconcileNodes(wf.nodes, { ...wf.nodes, n2: { ...wf.nodes.n2, config: { ...wf.nodes.n2.config, tag: "Keep" } } });
    assert.equal(validity.nodeInvalidations(fixed.n2).length, 0);
    assert.equal(validity.reconcileAudienceFilter({ kind: "tag", tag: "doomed", invalid: { reason: "tag_deleted", tag: "doomed", at: 1 } }, { kind: "tag", tag: "doomed" }).kind === "tag" && !!(validity.reconcileAudienceFilter({ kind: "tag", tag: "doomed", invalid: { reason: "tag_deleted", tag: "doomed", at: 1 } }, { kind: "tag", tag: "doomed" }) as { invalid?: unknown }).invalid, true);
  });
  await check("deleted-tag rules don't resurrect the tag in the library", async () => {
    const names2 = (await service.listTags({ subAccountId: SA, territoryIds: null, canManage: true })).tags.map((t) => t.name);
    assert.ok(!names2.some((n) => names.tagKey(n) === "doomed"), JSON.stringify(names2));
  });

  console.log("Case-insensitive matching everywhere");
  await mkContact("m1", ["VIP Customer", "Other"]);
  await db.doc("contacts/m1").update({ phone: "+14155552671" });
  await mkContact("m2", ["Other"]);
  await db.doc("contacts/m2").update({ phone: "+14155552672" });
  await check("broadcast tag audience: vip customer / VIP  CUSTOMER match VIP Customer", async () => {
    const a = await audience.resolveAudience(SA, { kind: "tag", tag: "vip customer" });
    assert.ok(a.recipients.some((c) => c.id === "m1"));
    assert.ok(!a.recipients.some((c) => c.id === "m2"));
    const b = await audience.resolveAudience(SA, { kind: "conditions", group: { all: [{ field: "tags", op: "not_has_tag", value: "  VIP   CUSTOMER " }] } });
    assert.ok(!b.recipients.some((c) => c.id === "m1"));
    assert.ok(b.recipients.some((c) => c.id === "m2"));
  });
  await check("voice audience + exclude-tag ignore capitalization", async () => {
    const v = await voice.resolveVoiceAudience(SA, { kind: "tag", tag: "VIP CUSTOMER" });
    assert.ok(v.recipients.some((c) => c.id === "m1"));
    const sup = await voice.resolveVoiceAudience(SA, { kind: "all" }, null, { recentDays: null, excludeCampaignId: null, excludeTag: "vip  customer" });
    assert.ok(sup.skipped.some((x) => x.contact.id === "m1" && x.reason === "suppressed_tag"));
    assert.ok(sup.recipients.some((c) => c.id === "m2"));
  });
  await check("multiple tags + zero-tag contacts", async () => {
    const both = { all: [{ field: "tags", op: "has_tag" as const, value: "vip customer" }, { field: "tags", op: "has_tag" as const, value: "OTHER" }] };
    assert.equal(evalConditionGroup(both, { id: "x", tags: ["VIP Customer", "Other"] } as never), true);
    assert.equal(evalConditionGroup(both, { id: "x", tags: [] } as never), false);
    assert.equal(evalConditionGroup({ all: [{ field: "tags", op: "not_has_tag", value: "VIP" }] }, { id: "x" } as never), true);
  });
  await check("checkout tag helpers + no duplicate logical assignment", async () => {
    assert.equal(crmRules.addTags(["VIP Customer"], ["vip  customer"]), null);
    assert.deepEqual(crmRules.removeTags(["VIP Customer", "x"], ["VIP CUSTOMER"]), ["x"]);
    assert.deepEqual(crmRules.cleanTags(["A b", "a  B", " c "]), ["A b", "c"]);
    const r = await writer.applyContactTags({ subAccountId: SA, contactId: "m1", add: [" vip   CUSTOMER "], ctx: { source: "api" } });
    assert.deepEqual(r?.added, []);
    assert.equal((await tagsOf("m1")).filter((t) => names.tagKey(t) === "vip customer").length, 1);
  });
  await check("rename run again is a no-op (safe retry)", async () => {
    const r1 = await service.renameTag({ subAccountId: SA, agencyId: AG, tagId: vipId, newName: "VIP Customer", uid: UID });
    assert.equal(r1.contactsUpdated, 0);
    assert.equal(r1.referencesUpdated, 0);
  });

  console.log("Isolation");
  await check("other workspace sees only its own tags", async () => {
    const other = await service.listTags({ subAccountId: SA2, territoryIds: null, canManage: true });
    assert.deepEqual(other.tags.map((t) => t.name), ["VIP"]);
    assert.equal(other.tags[0].usageCount, 1);
    await assert.rejects(service.getTagDetail({ subAccountId: SA2, tagId: vipId, territoryIds: null, canManage: true }), isErr(404, "not_found"));
    await assert.rejects(service.deleteTag({ subAccountId: SA2, tagId: vipId, uid: UID, confirmName: "VIP Customer", expectedReferenceCount: 0 }), isErr(404, "not_found"));
    await assert.rejects(service.renameTag({ subAccountId: SA2, agencyId: "ag_other", tagId: vipId, newName: "Hijack", uid: UID }), isErr(404, "not_found"));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
