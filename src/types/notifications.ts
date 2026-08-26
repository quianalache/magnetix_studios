import type { Timestamp } from "firebase-admin/firestore";

/**
 * MyMagnetix Notifications V1 — the reusable event/notification record this
 * whole feature is built around. Belongs to the canonical global Person
 * (`people/{personId}`), never a per-sub-account Member record, so one
 * notification center can aggregate events from every business a Person
 * has a real relationship with (see person-session.ts / mymagnetix-service.ts
 * for that identity model).
 *
 * Deliberately lean — no snapshot of the source object. `objectType` +
 * `objectId` + `destination` are enough to route the click; `meta` carries
 * only the small amount of already-resolved display copy (names) needed to
 * render the row safely even if the source object is later renamed/deleted.
 * This is intentional per the product spec: "The notification should remain
 * usable even if its source object changes" — a stale/deleted source object
 * degrades the notification's copy at worst, never breaks the row or (once
 * `destination` is followed) crashes the app — the destination page is
 * responsible for its own "not found" handling.
 */

export type NotificationEventType =
  | "course.access.granted"
  | "community.access.granted"
  | "community.reply"
  | "community.mention"
  // Booking loop (2026-08-26): the public booking flow now emits reliable
  // internal events for all three lifecycle transitions — see
  // notification-producers.ts's notifyBookingCreated/Rescheduled/Cancelled
  // and booking/lifecycle.ts's emitBookingWebhook. Real producers, wired.
  | "booking.created"
  | "booking.rescheduled"
  | "booking.cancelled"
  // Reading Ready loop (2026-08-26): wired to the ONE real "customer
  // generated their own reading" moment — the public Energetic Decoder
  // embed's submit endpoint — which already has a real, durable,
  // client-facing destination (the existing /decoder/[saId]/report/[readingId]
  // page). NOT fired for staff-generated readings (an existing, deliberate
  // manual "Share report" step there has no server event to hook — see
  // notification-producers.ts's notifyReadingReady doc comment) or for
  // GeneratedReport creation (always staff-only, same reasoning).
  | "reading.ready";

export type NotificationObjectType =
  | "course"
  | "community"
  | "post"
  | "comment"
  | "reading"
  | "booking";

export interface NotificationDoc {
  id: string;
  /** Canonical recipient — a `people/{id}` id, never a Member/Contact id. */
  personId: string;
  /** Originating business, where relevant (every V1 event type has one). */
  subAccountId: string | null;
  eventType: NotificationEventType;
  objectType: NotificationObjectType;
  /** Source object id where relevant (e.g. courseId, postId). Null when
   *  the event has no single addressable object. */
  objectId: string | null;
  /** Who caused this, if anyone — e.g. the member who replied/mentioned.
   *  Both forms recorded: `actorPersonId` (null if the actor has never
   *  logged into MyMagnetix, i.e. has no linked Person yet) and
   *  `actorMemberId` (always present when there's a real actor), matching
   *  the spec's "actorPersonId / actorMemberId" field pair. */
  actorPersonId: string | null;
  actorMemberId: string | null;
  /** Normalized, already-resolved user-facing copy — never re-derived from
   *  a live lookup at render time (see the module comment). */
  title: string;
  message: string | null;
  /** Internal deep-link target — either a same-origin MyMagnetix path, or
   *  (for a specific sub-account destination) the established
   *  `/api/my/enter?subAccountId=...&next=...` bridge, exactly like every
   *  other MyMagnetix cross-tenant link in mymagnetix-service.ts. Clicking
   *  a notification never bypasses that bridge's own real entitlement
   *  checks — see the service's tenancy notes. */
  destination: string;
  readAt: Timestamp | null;
  createdAt: Timestamp;
  /** `eventType + sourceObjectId + personId` (+ a version suffix for
   *  events that can legitimately recur, e.g. one per reply/mention) —
   *  the deterministic Firestore doc id itself, so a duplicate create is
   *  naturally a no-op. See notification-service.ts's `createNotification`. */
  dedupeKey: string;
  /** Small, safe, render-only extras — business/community/course display
   *  names, actor display name. Never a snapshot of the source object's
   *  own content (post/comment bodies, etc.). */
  meta: {
    businessName?: string;
    communityName?: string;
    courseName?: string;
    actorName?: string;
    bookingName?: string;
    readingName?: string;
  };
}

export type PublicNotification = NotificationDoc;

/**
 * Transactional Notification Emails V1 — the delivery-attempt record for
 * sending a real MyMagnetix Notification out as email, on top of the
 * originating sub-account's own verified sending domain (never a shared
 * platform sender for these — see notification-email-service.ts). Doc id
 * IS `notificationId` — the canonical idempotency source the product spec
 * calls for: a genuinely new Notification can only ever be created once
 * (see createNotification's own `.create()` dedupe), so a dispatch fired
 * exactly once per notification-creation is naturally at-most-once too.
 * `status: "failed"` is the one state a future retry pass is meant to
 * revisit (not built in V1) — every other terminal state is final.
 */
export type NotificationEmailStatus = "pending" | "sent" | "skipped" | "failed";

export interface NotificationEmailDelivery {
  /** Equal to the source NotificationDoc's own id. */
  id: string;
  notificationId: string;
  personId: string;
  subAccountId: string | null;
  channel: "email";
  status: NotificationEmailStatus;
  /** Distinguishes this from a future "optional activity" or "marketing"
   *  category once real preferences ship — V1 only ever writes this one. */
  emailCategory: "transactional_notification";
  eventType: NotificationEventType;
  provider: "resend";
  providerMessageId: string | null;
  /** Never trusted from a client — resolved server-side from the
   *  canonical Person doc at send time. Null while pending/skipped for a
   *  no-email reason. */
  recipientEmail: string | null;
  senderEmail: string | null;
  sentAt: Timestamp | null;
  /** Always sanitized/user-safe — never a raw provider error body. */
  failureReason: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One row per successful send — observational usage metering only (no
 * wallet, no billing, no customer-facing surface in V1). A future report
 * aggregates these however it needs; this file doesn't pre-decide the
 * aggregation dimension.
 */
export interface NotificationEmailUsageEntry {
  id: string;
  subAccountId: string;
  category: "transactional_notification";
  eventType: NotificationEventType;
  quantity: 1;
  provider: "resend";
  sentAt: Timestamp;
}
