import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { createNotification } from "@/lib/server/notification-service";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";
import { communityPostHref, communityHomeHref } from "@/lib/community/routes";
import { formatStartLocal } from "@/lib/booking/email";

/**
 * MyMagnetix Notifications V1 — real producers, called directly from the
 * existing write paths that already know the moment access/activity
 * genuinely happened (same call-site convention `emitWebhookEvent`/
 * `awardPoints` already use throughout this codebase). Reliability
 * (2026-08-26): every call site AWAITS these now, not `void`-fires them —
 * a void-fired call was confirmed live to sometimes lose the race against
 * the calling serverless function being frozen right after the response
 * is sent, silently dropping the notification. See notification-service.ts
 * for the full history (a plain `void` fire, then a failed `after()`
 * attempt, then this).
 *
 * Every COMMUNITY/COURSE producer resolves a Member -> Person via the SAME
 * field `listPersonMemberships` reads in reverse (`Member.personId`, only
 * ever set by a real login/reconciliation event) — a Member who has never
 * logged into MyMagnetix has no Person to notify, so these silently no-op
 * for them rather than inventing an identity.
 *
 * The BOOKING producers below are different: a booking customer is a CRM
 * Contact, never a community Member, so there's no `personId` field to
 * read. They resolve the Person directly via `ensurePersonIdentity(email)`
 * — the SAME canonical find-or-create every other identity path in this
 * codebase already uses (see person-identity-service.ts) — not a second
 * identity flow, just this codebase's one real one, entered from a
 * different starting record.
 */

function enterHref(subAccountId: string, next: string): string {
  return `/api/my/enter?subAccountId=${subAccountId}&next=${encodeURIComponent(next)}`;
}

async function resolvePersonIdForMember(subAccountId: string, memberId: string): Promise<string | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/members/${memberId}`).get();
  if (!snap.exists) return null;
  return (snap.data()?.personId as string | undefined) ?? null;
}

async function getMemberDisplayName(subAccountId: string, memberId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}/members/${memberId}`).get();
  const data = snap.data();
  return (data?.displayName as string) || (data?.email as string) || "Someone";
}

async function getBusinessName(subAccountId: string): Promise<string> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  return (snap.data()?.name as string) || "Magnetix";
}

/** Extracts every mentioned memberId from a sanitized post/comment body —
 *  the real markup `sanitizeCommunityPostHtml`/`sanitizeCommunityCommentHtml`
 *  (post-html.ts) produce: `<span data-type="mention" data-id="{memberId}"
 *  data-label="...">`. Attribute order isn't assumed. */
export function extractMentionedMemberIds(html: string): string[] {
  const ids = new Set<string>();
  const spanTagRegex = /<span\b[^>]*>/g;
  let match: RegExpExecArray | null;
  while ((match = spanTagRegex.exec(html))) {
    const tag = match[0];
    if (!/data-type="mention"/.test(tag)) continue;
    const idMatch = /data-id="([^"]+)"/.exec(tag);
    if (idMatch) ids.add(idMatch[1]);
  }
  return [...ids];
}

/* ------------------------------ Course access ------------------------------ */

export async function notifyCourseAccessGranted(opts: {
  subAccountId: string;
  courseId: string;
  memberId: string;
}): Promise<void> {
  const personId = await resolvePersonIdForMember(opts.subAccountId, opts.memberId);
  if (!personId) return;
  const [courseSnap, businessName] = await Promise.all([
    getAdminDb().doc(`subAccounts/${opts.subAccountId}/standaloneCourses/${opts.courseId}`).get(),
    getBusinessName(opts.subAccountId),
  ]);
  const courseName = (courseSnap.data()?.title as string) || "a course";

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "course.access.granted",
    objectType: "course",
    objectId: opts.courseId,
    title: `You were granted access to ${courseName}`,
    destination: enterHref(opts.subAccountId, `/course/${opts.subAccountId}/${opts.courseId}/classroom`),
    meta: { courseName, businessName },
    sourceObjectId: `${opts.courseId}:${opts.memberId}`,
  });
}

/* ---------------------------- Community access ----------------------------- */

/**
 * Shared by every real "membership became active" call site (direct join,
 * approval, course-linked auto-grant, paid purchase — see the report for
 * the full list) — each already computes its own `!wasActive`/
 * `becomesActive`/`isNewJoin`-style guard before calling this, so this
 * function itself does no re-derivation of "was this actually new."
 */
export async function notifyCommunityAccessGranted(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
}): Promise<void> {
  const personId = await resolvePersonIdForMember(opts.subAccountId, opts.memberId);
  if (!personId) return;
  const [groupSnap, businessName] = await Promise.all([
    getAdminDb().doc(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`).get(),
    getBusinessName(opts.subAccountId),
  ]);
  const communityName = (groupSnap.data()?.name as string) || "a Community";
  const groupSlug = (groupSnap.data()?.slug as string) || opts.groupId;

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "community.access.granted",
    objectType: "community",
    objectId: opts.groupId,
    title: `You were granted access to ${communityName}`,
    destination: enterHref(opts.subAccountId, communityHomeHref({ saId: opts.subAccountId, pretty: false }, groupSlug)),
    meta: { communityName, businessName },
    sourceObjectId: `${opts.groupId}:${opts.memberId}`,
  });
}

/* -------------------------------- Community activity ------------------------------- */

/**
 * A reply to a post (top-level comment, `parentId === null`) notifies the
 * POST's author; a reply to a comment (`parentId` set) notifies that
 * COMMENT's author — matching the spec's two example copies exactly. Never
 * fires for a self-reply (recipient === commenter).
 */
export async function notifyCommunityReply(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
  commenterMemberId: string;
  /** The post's author (always) or the parent comment's author (nested
   *  reply) — whichever this reply is actually replying TO. */
  recipientMemberId: string;
  isReplyToComment: boolean;
}): Promise<void> {
  if (opts.recipientMemberId === opts.commenterMemberId) return; // no self-notify

  const personId = await resolvePersonIdForMember(opts.subAccountId, opts.recipientMemberId);
  if (!personId) return;

  const [commenterName, groupSnap] = await Promise.all([
    getMemberDisplayName(opts.subAccountId, opts.commenterMemberId),
    getAdminDb().doc(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`).get(),
  ]);
  const communityName = (groupSnap.data()?.name as string) || "a Community";
  const groupSlug = (groupSnap.data()?.slug as string) || opts.groupId;

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "community.reply",
    objectType: "comment",
    objectId: opts.commentId,
    actorMemberId: opts.commenterMemberId,
    title: opts.isReplyToComment
      ? `${commenterName} replied to you in ${communityName}`
      : `${commenterName} replied to your post in ${communityName}`,
    destination: enterHref(
      opts.subAccountId,
      communityPostHref({ saId: opts.subAccountId, pretty: false }, groupSlug, opts.postId),
    ),
    meta: { communityName, actorName: commenterName },
    // The reply itself (commentId) is the recurring unit — each distinct
    // reply is its own real notification, never deduped against a prior one.
    sourceObjectId: opts.commentId,
  });
}

/**
 * One notification per mentioned member per post/comment. Never fires for
 * a self-mention (mentioning your own memberId).
 */
export async function notifyCommunityMentions(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  /** The post itself when the mention is in a post body, or the comment id
   *  when it's in a comment/reply — always the destination's own anchor. */
  contentObjectId: string;
  authorMemberId: string;
  mentionedMemberIds: string[];
}): Promise<void> {
  const targets = opts.mentionedMemberIds.filter((id) => id !== opts.authorMemberId);
  if (targets.length === 0) return;

  const [authorName, groupSnap] = await Promise.all([
    getMemberDisplayName(opts.subAccountId, opts.authorMemberId),
    getAdminDb().doc(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`).get(),
  ]);
  const communityName = (groupSnap.data()?.name as string) || "a Community";
  const groupSlug = (groupSnap.data()?.slug as string) || opts.groupId;
  const destination = enterHref(
    opts.subAccountId,
    communityPostHref({ saId: opts.subAccountId, pretty: false }, groupSlug, opts.postId),
  );

  await Promise.all(
    targets.map(async (memberId) => {
      const personId = await resolvePersonIdForMember(opts.subAccountId, memberId);
      if (!personId) return;
      await createNotification({
        personId,
        subAccountId: opts.subAccountId,
        eventType: "community.mention",
        objectType: "comment",
        objectId: opts.contentObjectId,
        actorMemberId: opts.authorMemberId,
        title: `${authorName} mentioned you in ${communityName}`,
        destination,
        meta: { communityName, actorName: authorName },
        // One mention notification per (content item, recipient) — the
        // SAME content edited/re-mentioning the same person again is a
        // real product decision for later, not handled here; this call
        // only ever runs once, at creation time.
        sourceObjectId: `${opts.contentObjectId}:${memberId}`,
      });
    }),
  );
}

/* ----------------------------------- Booking ----------------------------------- */

/**
 * Destination for every booking notification is the real, already-shipped
 * public event page (`/e/{token}`) — the SAME page the legacy confirmation/
 * reschedule emails already link to ("Manage your booking"). Deliberately
 * NOT the `/api/my/enter` bridge every other producer above uses: that
 * bridge's entire security model requires a real, active tenant MEMBER
 * relationship, and a booking-only customer (the common case for a
 * booking-first business) never has one — they're a Contact, not a
 * Member. `/e/{token}` has its own, already-proven, no-login-required
 * security model (possession of the mailed token), which works for every
 * booking customer regardless of whether they've ever used MyMagnetix —
 * so it's used verbatim, not wrapped.
 */
function bookingDestination(token: string): string {
  // Same-origin relative path, exactly like every other producer's
  // `destination` (see enterHref above) — `router.push` in the bell and
  // this codebase's routing throughout only ever needs the path, never an
  // absolute URL. Unlike `buildEventPublicUrl` (which the OUTBOUND EMAIL
  // uses, and does need a full URL to be clickable outside the app).
  return `/e/${token}`;
}

async function getBookingContact(contactId: string): Promise<{ email: string } | null> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  const email = (snap.data()?.email as string | undefined)?.trim();
  if (!email) return null;
  return { email };
}

export async function notifyBookingCreated(opts: {
  subAccountId: string;
  bookingId: string;
  contactId: string;
  bookingName: string;
  startAt: Date;
  timezone: string;
  /** Raw public token — the route that creates the booking already mints
   *  one (issueEventToken); pass it straight through, never re-derived
   *  here (this file never mints tokens). */
  token: string;
}): Promise<void> {
  const destination = bookingDestination(opts.token);
  const contact = await getBookingContact(opts.contactId);
  if (!contact) return;

  const [personId, businessName] = await Promise.all([
    ensurePersonIdentity(contact.email),
    getBusinessName(opts.subAccountId),
  ]);
  const when = formatStartLocal(opts.startAt, opts.timezone);

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "booking.created",
    objectType: "booking",
    objectId: opts.bookingId,
    title: `Your ${opts.bookingName} is booked for ${when}.`,
    destination,
    meta: { bookingName: opts.bookingName, businessName },
    // A booking is only ever created once — bookingId alone is the
    // recurring unit, matching "booking.created: bookingId + created event".
    sourceObjectId: opts.bookingId,
  });
}

export async function notifyBookingRescheduled(opts: {
  subAccountId: string;
  bookingId: string;
  contactId: string;
  bookingName: string;
  startAt: Date;
  timezone: string;
  /** The NEW token minted by this reschedule — also doubles as the
   *  per-occurrence dedupe disambiguator below, since it's a fresh,
   *  guaranteed-unique value every single reschedule mints regardless of
   *  how close together two reschedules happen. */
  token: string;
}): Promise<void> {
  const destination = bookingDestination(opts.token);
  const contact = await getBookingContact(opts.contactId);
  if (!contact) return;

  const [personId, businessName] = await Promise.all([
    ensurePersonIdentity(contact.email),
    getBusinessName(opts.subAccountId),
  ]);
  const when = formatStartLocal(opts.startAt, opts.timezone);

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "booking.rescheduled",
    objectType: "booking",
    objectId: opts.bookingId,
    title: `Your ${opts.bookingName} was rescheduled to ${when}.`,
    destination,
    meta: { bookingName: opts.bookingName, businessName },
    // A booking can be rescheduled more than once — bookingId alone would
    // collapse every reschedule onto the FIRST one's dedupeKey. The new
    // token's own nonce (its middle segment — see event-token.ts's format)
    // is a cheap, always-available, guaranteed-unique-per-occurrence
    // disambiguator (matches "booking.rescheduled: bookingId + reschedule
    // occurrence... identity").
    sourceObjectId: `${opts.bookingId}:${opts.token.split(".")[1] ?? opts.token.slice(0, 24)}`,
  });
}

export async function notifyBookingCancelled(opts: {
  subAccountId: string;
  bookingId: string;
  contactId: string;
  bookingName: string;
  /** Raw public token valid for this booking at cancellation time. The
   *  visitor-initiated cancel route already has one in scope (cancelling
   *  doesn't rotate it). Staff-initiated cancel and the payment-hold
   *  auto-expire path have no raw token in scope at all (only the event's
   *  publicTokenHash is ever persisted — the SAME reason the legacy
   *  cancellation email has never linked anywhere) — those two callers
   *  mint a fresh one via issueEventToken specifically to give this
   *  notification a real, working destination; see their route files. */
  token: string;
}): Promise<void> {
  const destination = bookingDestination(opts.token);
  const contact = await getBookingContact(opts.contactId);
  if (!contact) return;

  const [personId, businessName] = await Promise.all([
    ensurePersonIdentity(contact.email),
    getBusinessName(opts.subAccountId),
  ]);

  await createNotification({
    personId,
    subAccountId: opts.subAccountId,
    eventType: "booking.cancelled",
    objectType: "booking",
    objectId: opts.bookingId,
    title: `Your ${opts.bookingName} was cancelled.`,
    destination,
    meta: { bookingName: opts.bookingName, businessName },
    // A booking is only ever cancelled once (terminal state) — bookingId
    // alone is the recurring unit. Safe to call this from a retried
    // cancel/expire attempt: createNotification's own .create() dedupe
    // collapses it to a no-op, so this function needs no retry-awareness
    // of its own.
    sourceObjectId: opts.bookingId,
  });
}
