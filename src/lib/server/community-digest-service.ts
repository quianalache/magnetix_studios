import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendTenantEmail, tenantFrom } from "@/lib/comms/resend";
import { CANONICAL_APP_ORIGIN } from "@/lib/server/app-origin";
import { getInaccessibleChannelNames } from "@/lib/server/community-channels-service";
import { listCommunityEventsServerSide } from "@/lib/server/community-event-service";
import { resolveMemberAccessServerSide } from "@/lib/server/community-membership-service";
import { getMemberCommunityPrefs } from "@/lib/server/community-notification-prefs";
import {
  allows,
  digestDue,
  digestWindowStart,
  memberWantsDigest,
  normalizeNotificationSettings,
} from "@/lib/community/membership-access";

/**
 * Community Digest (2026-11-05) — a deterministic activity summary, sent by
 * the hourly-checked daily cron to members who want it. Never AI-written.
 * Each member only sees posts in channels they can access and events their
 * Membership Level includes. Off by default; turning it on starts the clock
 * (no backlog digest), and a group is claimed in a transaction before
 * sending so a retry can't double-send.
 */

export interface DigestPost {
  id: string;
  title: string;
  category: string | null;
  likeCount: number;
  commentCount: number;
}
export interface DigestEvent {
  id: string;
  title: string;
  startAtMs: number;
}
export interface DigestContent {
  posts: DigestPost[];
  events: DigestEvent[];
  newMembers: number;
}

function ms(v: unknown): number {
  const t = v as { toMillis?: () => number } | null;
  return typeof t?.toMillis === "function" ? t.toMillis() : typeof v === "number" ? v : 0;
}

function secret(): string {
  const s = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!s) throw new Error("AUTOMATIONS_TOKEN_SECRET is not configured.");
  return s;
}

export function signDigestUnsubscribeToken(personId: string, sa: string, g: string): string {
  const payload = `${personId}.${sa}.${g}`;
  return `${payload}.${createHmac("sha256", secret()).update(`digest-unsub:${payload}`).digest("hex")}`;
}

export function verifyDigestUnsubscribeToken(token: string): { personId: string; subAccountId: string; groupId: string } | null {
  const [personId, subAccountId, groupId, sig] = token.split(".");
  if (!personId || !subAccountId || !groupId || !sig) return null;
  const expected = createHmac("sha256", secret()).update(`digest-unsub:${personId}.${subAccountId}.${groupId}`).digest("hex");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { personId, subAccountId, groupId };
}

/** Everything that happened in the window, before per-member filtering. */
export async function collectDigestActivity(sa: string, g: string, fromMs: number, now: Date): Promise<{ posts: (DigestPost & { createdAtMs: number })[]; events: DigestEvent[]; newMembers: number }> {
  const db = getAdminDb();
  const base = `subAccounts/${sa}/communityGroups/${g}`;
  const [posts, memberships, events] = await Promise.all([
    db.collection(`${base}/posts`).where("createdAt", ">=", new Date(fromMs)).limit(300).get(),
    db.collection(`${base}/memberships`).where("status", "==", "active").get(),
    listCommunityEventsServerSide(sa, g),
  ]);
  const horizon = now.getTime() + 14 * 24 * 60 * 60 * 1000;
  return {
    posts: posts.docs
      .map((d) => ({
        id: d.id,
        title: String(d.data().title ?? "").slice(0, 140),
        category: (d.data().category as string | undefined) || null,
        likeCount: Number(d.data().likeCount ?? 0),
        commentCount: Number(d.data().commentCount ?? 0),
        createdAtMs: ms(d.data().createdAt),
      }))
      .filter((p) => p.title),
    events: events
      .filter((e) => e.status !== "canceled" && ms(e.startAt) >= now.getTime() && ms(e.startAt) <= horizon)
      .map((e) => ({ id: e.id, title: e.title, startAtMs: ms(e.startAt) })),
    newMembers: memberships.docs.filter((d) => ms(d.data().joinedAt) >= fromMs).length,
  };
}

/** One member's view: inaccessible channels and events removed; top 5 posts. */
export function digestForMember(
  activity: Awaited<ReturnType<typeof collectDigestActivity>>,
  inaccessibleChannels: Set<string>,
  eventAccess: "all" | Set<string>
): DigestContent {
  const posts = activity.posts
    .filter((p) => !p.category || !inaccessibleChannels.has(p.category))
    .sort((a, b) => b.likeCount + b.commentCount * 2 - (a.likeCount + a.commentCount * 2) || b.createdAtMs - a.createdAtMs)
    .slice(0, 5)
    .map(({ createdAtMs: _drop, ...p }) => p);
  const events = activity.events.filter((e) => allows(eventAccess, e.id)).slice(0, 5);
  return { posts, events, newMembers: activity.newMembers };
}

export function digestIsEmpty(c: DigestContent): boolean {
  return c.posts.length === 0 && c.events.length === 0 && c.newMembers === 0;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderDigestEmail(opts: {
  communityName: string;
  frequency: string;
  content: DigestContent;
  communityUrl: string;
  postUrl: (postId: string) => string;
  unsubscribeUrl: string;
  manageUrl: string;
}): { subject: string; text: string; html: string } {
  const label = opts.frequency === "daily" ? "today" : opts.frequency === "weekly" ? "this week" : "this month";
  const subject = `What's new in ${opts.communityName} ${label}`;
  const fmt = (t: number) => new Date(t).toUTCString().slice(0, 22);
  const lines: string[] = [subject, ""];
  if (opts.content.posts.length) {
    lines.push("Top posts:");
    for (const p of opts.content.posts) lines.push(`- ${p.title} (${opts.postUrl(p.id)})`);
    lines.push("");
  }
  if (opts.content.events.length) {
    lines.push("Upcoming events:");
    for (const e of opts.content.events) lines.push(`- ${e.title} — ${fmt(e.startAtMs)} UTC`);
    lines.push("");
  }
  if (opts.content.newMembers) lines.push(`${opts.content.newMembers} new member${opts.content.newMembers === 1 ? "" : "s"} joined.`, "");
  lines.push(`Open the community: ${opts.communityUrl}`, "", `Manage notifications: ${opts.manageUrl}`, `Unsubscribe from this digest: ${opts.unsubscribeUrl}`);
  const section = (title: string, body: string) =>
    `<h2 style="margin:24px 0 8px;font-size:14px;color:#3d1650;text-transform:uppercase;letter-spacing:0.04em;">${title}</h2>${body}`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f7f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2a2230;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #ece6f1;border-radius:14px;"><tr><td style="padding:28px 28px 8px;">
<p style="margin:0;font-size:12px;color:#7b7182;text-transform:uppercase;letter-spacing:0.05em;">${esc(opts.communityName)}</p>
<h1 style="margin:6px 0 0;font-size:20px;">${esc(subject)}</h1>
${opts.content.posts.length ? section("Top posts", opts.content.posts.map((p) => `<p style="margin:0 0 10px;font-size:15px;"><a href="${esc(opts.postUrl(p.id))}" style="color:#3d1650;font-weight:600;text-decoration:none;">${esc(p.title)}</a><br><span style="font-size:12px;color:#7b7182;">${p.likeCount} likes · ${p.commentCount} comments</span></p>`).join("")) : ""}
${opts.content.events.length ? section("Upcoming events", opts.content.events.map((e) => `<p style="margin:0 0 8px;font-size:15px;">${esc(e.title)}<br><span style="font-size:12px;color:#7b7182;">${esc(fmt(e.startAtMs))} UTC</span></p>`).join("")) : ""}
${opts.content.newMembers ? section("New members", `<p style="margin:0;font-size:15px;">${opts.content.newMembers} new member${opts.content.newMembers === 1 ? "" : "s"} joined.</p>`) : ""}
<p style="margin:24px 0 20px;"><a href="${esc(opts.communityUrl)}" style="display:inline-block;background:#3d1650;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;">Open the community</a></p>
</td></tr><tr><td style="padding:14px 28px 22px;border-top:1px solid #f0ebf3;font-size:12px;color:#7b7182;">
<a href="${esc(opts.manageUrl)}" style="color:#7b7182;">Manage notifications</a> · <a href="${esc(opts.unsubscribeUrl)}" style="color:#7b7182;">Unsubscribe from this digest</a>
</td></tr></table></body></html>`;
  return { subject, text: lines.join("\n"), html };
}

type SendFn = (input: { to: string; subject: string; text: string; html: string; headers: Record<string, string>; idempotencyKey: string }) => Promise<unknown>;

/** Claim the group's digest for this run (transaction) — false if not due. */
async function claimDigest(sa: string, g: string, now: Date): Promise<{ claimed: boolean; fromMs: number; frequency: string }> {
  const ref = getAdminDb().doc(`subAccounts/${sa}/communityGroups/${g}`);
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const settings = normalizeNotificationSettings(snap.data()?.notificationSettings);
    if (snap.data()?.status !== "published" || !digestDue(settings, now)) return { claimed: false, fromMs: 0, frequency: settings.digest.frequency };
    const fromMs = digestWindowStart(settings, now);
    tx.set(ref, { notificationSettings: { ...settings, digest: { ...settings.digest, lastSentAtMs: now.getTime() } } }, { merge: true });
    return { claimed: true, fromMs, frequency: settings.digest.frequency };
  });
}

export async function sendCommunityDigest(sa: string, g: string, now: Date, opts: { send?: SendFn; force?: boolean } = {}): Promise<{ sent: number; skipped: number; claimed: boolean }> {
  const db = getAdminDb();
  const claim = opts.force
    ? { claimed: true, fromMs: now.getTime() - 7 * 24 * 60 * 60 * 1000, frequency: "weekly" }
    : await claimDigest(sa, g, now);
  if (!claim.claimed) return { sent: 0, skipped: 0, claimed: false };
  const [subSnap, groupSnap] = await Promise.all([db.doc(`subAccounts/${sa}`).get(), db.doc(`subAccounts/${sa}/communityGroups/${g}`).get()]);
  const sub = subSnap.data();
  if (!opts.send && !tenantFrom(sub as never)) {
    console.warn("[community-digest] no verified sending domain; skipped", sa, g);
    return { sent: 0, skipped: 0, claimed: true };
  }
  const group = groupSnap.data() as { name?: string; slug?: string };
  const settings = normalizeNotificationSettings((groupSnap.data() ?? {}).notificationSettings);
  const activity = await collectDigestActivity(sa, g, claim.fromMs, now);
  const roster = await db.collection(`subAccounts/${sa}/communityGroups/${g}/memberships`).where("status", "==", "active").get();
  const origin = CANONICAL_APP_ORIGIN;
  const enter = (next: string) => `${origin}/api/my/enter?subAccountId=${encodeURIComponent(sa)}&next=${encodeURIComponent(next)}`;
  let sent = 0;
  let skipped = 0;
  for (const m of roster.docs) {
    const member = (await db.doc(`subAccounts/${sa}/members/${m.id}`).get()).data();
    const personId = member?.personId as string | undefined;
    const email = (member?.email as string | undefined)?.trim().toLowerCase();
    if (!personId || !email) { skipped++; continue; }
    const prefs = await getMemberCommunityPrefs(personId, sa, g);
    if (!memberWantsDigest(settings, prefs)) { skipped++; continue; }
    const isModerator = m.data().role === "moderator";
    const [inaccessible, access] = await Promise.all([
      getInaccessibleChannelNames({ subAccountId: sa, groupId: g, isModerator, memberId: m.id }),
      resolveMemberAccessServerSide({ subAccountId: sa, groupId: g, memberId: m.id, isModerator }),
    ]);
    const content = digestForMember(activity, inaccessible, access.events);
    if (digestIsEmpty(content)) { skipped++; continue; }
    const unsubscribeUrl = `${origin}/api/my/notifications/digest-unsubscribe?t=${encodeURIComponent(signDigestUnsubscribeToken(personId, sa, g))}`;
    const rendered = renderDigestEmail({
      communityName: group.name ?? "your community",
      frequency: claim.frequency,
      content,
      communityUrl: enter(`/c/${sa}/${group.slug}/community`),
      postUrl: (postId) => enter(`/c/${sa}/${group.slug}/community/${postId}`),
      unsubscribeUrl,
      manageUrl: `${origin}/my/settings/community/${encodeURIComponent(g)}?subAccountId=${encodeURIComponent(sa)}`,
    });
    const headers = { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
    const idempotencyKey = `digest-${g}-${claim.fromMs}-${m.id}`;
    try {
      if (opts.send) await opts.send({ to: email, ...rendered, headers, idempotencyKey });
      else await sendTenantEmail({ sub: sub as never, to: email, subject: rendered.subject, text: rendered.text, html: rendered.html, headers, idempotencyKey });
      sent++;
    } catch (err) {
      skipped++;
      console.warn("[community-digest] send failed", g, m.id, err instanceof Error ? err.message : err);
    }
  }
  return { sent, skipped, claimed: true };
}

/** Cron entry: every tenant community whose digest is due right now. */
export async function runCommunityDigests(now = new Date()): Promise<{ groups: number; sent: number }> {
  const groups = await getAdminDb().collectionGroup("communityGroups").get();
  let n = 0;
  let sent = 0;
  for (const g of groups.docs) {
    const sa = g.ref.parent.parent?.id;
    if (!sa || g.ref.parent.parent?.parent.id !== "subAccounts") continue;
    const settings = normalizeNotificationSettings(g.data().notificationSettings);
    if (!digestDue(settings, now)) continue;
    const r = await sendCommunityDigest(sa, g.id, now).catch((err) => {
      console.warn("[community-digest] group failed", g.id, err);
      return { sent: 0, skipped: 0, claimed: false };
    });
    if (r.claimed) n++;
    sent += r.sent;
  }
  return { groups: n, sent };
}
