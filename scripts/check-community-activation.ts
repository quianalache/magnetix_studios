/**
 * Community member activation email — deterministic checks.
 *
 * Offline: safe destination rule, email copy + escaping + link.
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): preview
 * classification, send → ledger, duplicate refusal, failed-send retry, test
 * sends skip the ledger, Person linked without duplicates, link sets the
 * password once and returns the community destination, expired link refused.
 *
 * Run: pnpm check:community-activation
 */
import assert from "node:assert/strict";
import { safePersonPasswordNextPath } from "../src/lib/server/person-password";
import { renderCommunityActivationEmail, firstNameOf } from "../src/lib/server/community-activation-service";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

async function offline() {
  await check("destination rule: only MyMagnetix paths and the member bridge", () => {
    assert.equal(safePersonPasswordNextPath("/my"), "/my");
    assert.equal(safePersonPasswordNextPath("/my/communities"), "/my/communities");
    assert.equal(safePersonPasswordNextPath("/api/my/enter?subAccountId=a&next=%2Fc%2Fa%2Fb"), "/api/my/enter?subAccountId=a&next=%2Fc%2Fa%2Fb");
    for (const bad of ["//evil.com", "https://evil.com", "/dashboard", "/sa/x/contacts", "/my\\evil", "", null, 7]) {
      assert.equal(safePersonPasswordNextPath(bad), null, String(bad));
    }
  });
  await check("email: owner copy, recipient link, escaping, expiry help", () => {
    const e = renderCommunityActivationEmail({ firstName: "<b>Ana</b>", communityName: "Magnetic Visibility Circle", link: "https://crm.magnetixstudios.com/my/password/reset?token=abc", loginUrl: "https://crm.magnetixstudios.com/my/login" });
    assert.equal(e.subject, "Your Magnetic Visibility Circle access is ready ✨");
    assert.ok(e.html.includes("&lt;b&gt;Ana&lt;/b&gt;") && !e.html.includes("<b>Ana</b>"));
    assert.ok(e.html.includes('href="https://crm.magnetixstudios.com/my/password/reset?token=abc"'));
    assert.ok(e.html.includes("Set My Password + Access the Community"));
    for (const line of ["We’ve already added you to the community", "Set up your password to activate your MyMagnetix account.", "With infinite love,", "Quiana", "Forgot password?"]) {
      assert.ok(e.text.includes(line), line);
    }
    assert.equal(firstNameOf("Ana Maria Lopez"), "Ana");
    assert.equal(firstNameOf("  "), "there");
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  process.env.AUTOMATIONS_TOKEN_SECRET ||= "test-secret-for-activation-checks-0123456789";
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const svc = await import("../src/lib/server/community-activation-service");
  const pw = await import("../src/lib/server/person-password");
  const db = getAdminDb();
  const SA = `sa_act_${Date.now()}`, G = "grp1";
  const c = { subAccountId: SA, groupId: G, campaign: "test-campaign", communityName: "Test Circle", excludeEmails: ["owner@example.com"], origin: "https://crm.magnetixstudios.com" };
  const sent: { to: string; html: string; text: string }[] = [];
  const okSend = async (i: { to: string; html: string; text: string }) => { sent.push(i); return { id: `msg_${sent.length}` }; };
  const member = async (id: string, data: Record<string, unknown>, membership = "active") => {
    await db.doc(`subAccounts/${SA}/members/${id}`).set({ subAccountId: SA, agencyId: "ag", status: "active", displayName: `${id} Person`, ...data });
    await db.doc(`subAccounts/${SA}/communityGroups/${G}/memberships/${id}`).set({ memberId: id, status: membership });
  };
  await db.doc(`subAccounts/${SA}`).set({ name: "Test" });
  await db.doc(`subAccounts/${SA}/communityGroups/${G}`).set({ name: "Test Circle", slug: "test-circle" });
  const existingPerson = await db.collection("people").add({ primaryEmail: `a_${SA}@example.com`.toLowerCase() });
  await member("a", { email: `a_${SA}@example.com` }); // needs activation; Person exists but not linked
  const activePerson = await db.collection("people").add({ primaryEmail: `b_${SA}@example.com`.toLowerCase(), passwordHash: "scrypt$1$x$y" });
  await member("b", { email: `b_${SA}@example.com`, personId: activePerson.id }); // already active
  await member("c", { email: "not-an-email" });
  await member("d", { email: `d_${SA}@example.com`, emailVerified: false });
  await member("e", { email: "owner@example.com" });
  await member("f", { email: `f_${SA}@example.com` }, "removed"); // not an active membership
  await member("g", { email: `g_${SA}@example.com` }); // first send fails

  try {
    await check("preview classifies every active membership", async () => {
      const p = await svc.previewCommunityActivation(c);
      assert.equal(p.counts.total, 6, "removed membership not listed");
      assert.deepEqual(
        Object.fromEntries(p.recipients.map((r) => [r.memberId, r.state])),
        { a: "needs_activation", b: "already_active", c: "invalid_email", d: "unverified_member", e: "excluded", g: "needs_activation" }
      );
    });
    let link = "";
    await check("send: one email to the member's own address, ledger sent, Person linked, no duplicate Person", async () => {
      const r = await svc.sendCommunityActivationEmail(c, "a", { send: okSend });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(sent.at(-1)!.to, `a_${SA}@example.com`.toLowerCase());
      link = /href="(https:\/\/crm\.magnetixstudios\.com\/my\/password\/reset\?token=[^"]+)"/.exec(sent.at(-1)!.html)![1];
      assert.ok(link);
      const ledger = (await db.doc(`subAccounts/${SA}/communityGroups/${G}/activationEmails/test-campaign__a`).get()).data()!;
      assert.equal(ledger.status, "sent");
      assert.ok(!JSON.stringify(ledger).includes(new URL(link.replace(/&amp;/g, "&")).searchParams.get("token")!), "raw token not stored in ledger");
      assert.equal((await db.doc(`subAccounts/${SA}/members/a`).get()).data()!.personId, existingPerson.id);
      assert.equal((await db.collection("people").where("primaryEmail", "==", `a_${SA}@example.com`.toLowerCase()).get()).size, 1);
    });
    await check("duplicate send refused; preview shows already_sent", async () => {
      const r = await svc.sendCommunityActivationEmail(c, "a", { send: okSend });
      assert.equal(r.ok, false);
      assert.equal((r as { skipped: string }).skipped, "already_sent");
      assert.equal((await svc.previewCommunityActivation(c)).recipients.find((x) => x.memberId === "a")!.state, "already_sent");
    });
    await check("active, invalid, unverified and inactive members are never sent", async () => {
      for (const id of ["b", "c", "d", "f"]) {
        const r = await svc.sendCommunityActivationEmail(c, id, { send: okSend });
        assert.equal(r.ok, false, id);
      }
    });
    await check("failed send is recorded and can be retried once", async () => {
      const r1 = await svc.sendCommunityActivationEmail(c, "g", { send: async () => { throw new Error("provider down"); } });
      assert.equal(r1.ok, false);
      assert.equal((await svc.previewCommunityActivation(c)).recipients.find((x) => x.memberId === "g")!.state, "needs_activation");
      const r2 = await svc.sendCommunityActivationEmail(c, "g", { send: okSend });
      assert.equal(r2.ok, true);
      const r3 = await svc.sendCommunityActivationEmail(c, "g", { send: okSend });
      assert.equal(r3.ok, false);
    });
    await check("test send writes no ledger", async () => {
      await member("t", { email: `t_${SA}@example.com` });
      const r = await svc.sendCommunityActivationEmail(c, "t", { test: true, send: okSend });
      assert.equal(r.ok, true);
      assert.equal((await db.doc(`subAccounts/${SA}/communityGroups/${G}/activationEmails/test-campaign__t`).get()).exists, false);
    });
    await check("link sets the password once and returns the community destination", async () => {
      const token = new URL(link.replace(/&amp;/g, "&")).searchParams.get("token")!;
      const r = await pw.consumePersonPasswordToken({ token, password: "a-strong-pass-123" });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal((r as { nextPath: string }).nextPath, `/api/my/enter?subAccountId=${SA}&next=${encodeURIComponent(`/c/${SA}/test-circle`)}`);
      assert.ok((await db.doc(`people/${existingPerson.id}`).get()).data()!.passwordHash);
      const again = await pw.consumePersonPasswordToken({ token, password: "another-pass-456" });
      assert.equal(again.ok, false, "used link refused");
      const login = await pw.authenticatePersonWithPassword({ email: `a_${SA}@example.com`, password: "a-strong-pass-123" });
      assert.equal(login.ok, true, "can sign in with the new password");
      const p = await svc.previewCommunityActivation(c);
      assert.equal(p.recipients.find((x) => x.memberId === "a")!.state, "already_sent");
    });
    await check("expired link refused; 7-day activation expiry", async () => {
      const token = await pw.createPersonPasswordToken({ personId: existingPerson.id, email: `a_${SA}@example.com`, purpose: "activation", ttlMs: -1000 });
      assert.equal((await pw.consumePersonPasswordToken({ token, password: "whatever-123" })).ok, false);
      assert.equal(svc.COMMUNITY_ACTIVATION_TTL_MS, 7 * 24 * 60 * 60 * 1000);
    });
  } finally {
    await db.recursiveDelete(db.doc(`subAccounts/${SA}`));
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Community activation checks: ${passed} passed${emu ? " (incl. emulator)" : " (offline; set the emulator env for persistence)"}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
