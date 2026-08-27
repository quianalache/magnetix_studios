import type { Timestamp, FieldValue } from "firebase/firestore";
import type { ConditionGroup } from "./workflows";

/**
 * Bulk email broadcasts.
 *
 * Schema:
 *   broadcasts/{broadcastId}                  — the broadcast doc
 *   broadcasts/{broadcastId}/sends/{contactId} — per-recipient row
 *
 * The broadcast doc tracks the audience as a whole (totals, status, who
 * triggered it). The per-recipient subcollection rows are the unit of work
 * fanned out via QStash — one row, one /step callback, one Resend API
 * call. Status transitions on the row drive the totals on the parent doc
 * via FieldValue.increment().
 *
 * Channel is email-only in v1. SMS broadcasts come in a follow-up that adds
 * compliance scaffolding (consent capture, A2P 10DLC throughput awareness).
 */

export type BroadcastChannel = "email";

export type BroadcastStatus =
  /**
   * Persistent Broadcast Drafts V1 (2026-08-27) — never launched. A draft
   * is created at "first meaningful edit" (subject/content/audience
   * becomes non-empty) and autosaved from then on. The SAME doc is reused
   * when the operator eventually sends it (status flips draft → queued in
   * place, never a second doc) — see /api/broadcasts/email/send's optional
   * `draftId`. A draft is the only status a broadcast can be DELETED from
   * (see DELETE /api/broadcasts/[broadcastId]) — every other status is a
   * launched send and keeps its full audit trail forever.
   */
  | "draft"
  /** Audience computed, sends queued, QStash messages published. */
  | "queued"
  /** First send has fired; at least one row has flipped from queued. */
  | "sending"
  /** Every row has settled (sent / skipped / failed). */
  | "completed"
  /** Hard-failed during creation (e.g. QStash misconfigured). */
  | "failed"
  /**
   * Production safety controls (2026-08-26, added after a live incident —
   * see docs/debug notes on broadcast nf4y6KBytpIAwzO0l17d): an operator
   * cancelled the send while rows were still queued/sending. Every
   * still-queued QStash callback checks this status before calling Resend
   * (see /api/broadcasts/email/step) and safely no-ops instead of sending —
   * this replaces the manual "delete the queued rows" emergency procedure
   * with a real, idempotent kill switch. Already-`sent` rows are untouched;
   * rows still `queued` at cancel time settle to `skipped` (reason
   * "cancelled") lazily, as their callback fires, rather than in one giant
   * synchronous batch update.
   */
  | "cancelled";

/**
 * Audience filter applied at fan-out time.
 *
 * `"all"` / `"tag"` / `"pipeline_stage"` are the original v1 shapes —
 * PRESERVED for backward compatibility. Every sent broadcast in history
 * used one of these three, and the list/detail pages + `resolveAudience`
 * must keep rendering and (if ever re-resolved) evaluating them exactly as
 * before. Never migrated/rewritten in place — no need to, since a sent
 * broadcast's audience is fixed at send time anyway (the `sends`
 * subcollection is the durable record).
 *
 * `"conditions"` is Segmentation V1 (2026-08-27) — reuses the SAME
 * ConditionGroup/Condition model the Workflow Builder already uses for
 * trigger filters and if/else branches (see
 * lib/segmentation/eval-condition-group.ts), not a second segmentation
 * language. The New Broadcast composer only ever WRITES this new shape
 * going forward; the three legacy shapes are read-path-only from here on.
 */
export type BroadcastAudienceFilter =
  | { kind: "all" }
  | { kind: "tag"; tag: string }
  | { kind: "pipeline_stage"; stage: string }
  | { kind: "conditions"; group: ConditionGroup };

export interface BroadcastTotals {
  /** Total contacts the audience query returned (before opt-out / missing-email skip). */
  audienceSize: number;
  /** Recipients fanned out to QStash. */
  queued: number;
  /** Recipients confirmed delivered to Resend (their API accepted the send). */
  sent: number;
  /** Recipients dropped pre-send (opted out, no email address, etc.). */
  skipped: number;
  /** Recipients where the Resend API call returned an error. */
  failed: number;
  /** Unique recipients Resend confirmed actual mailbox delivery for (email.delivered). */
  delivered: number;
  /** Unique recipients who opened (email.opened) — counted once even across repeat opens. */
  opened: number;
  /** Unique recipients who clicked a link (email.clicked) — counted once even across repeat clicks. */
  clicked: number;
  /** Recipients whose send bounced (email.bounced, hard or soft). */
  bounced: number;
  /** Recipients who marked the email as spam (email.complained). */
  complained: number;
}

export interface BroadcastDoc {
  id: string;
  agencyId: string;
  subAccountId: string;
  channel: BroadcastChannel;
  /**
   * Legacy content path (`message_templates`-based) — present only on
   * broadcasts sent before the block-composer rebuild. New broadcasts use
   * `content`/`subject`/`preheader` instead; the detail page branches on
   * whichever is present so old broadcasts still render correctly.
   */
  templateId?: string;
  /** Snapshot of the template name at send time — survives template renames. */
  templateName?: string;
  /** Snapshot of the resolved subject (after merge tags). Useful for the list view. */
  subjectPreview: string;
  /** Block-schema content, present on every broadcast sent via the composer. */
  content?: import("./broadcast-content").BroadcastContent;
  subject?: string;
  preheader?: string | null;
  /** Which saved template (if any) this broadcast started from — audit only, content is always the source of truth. */
  sourceTemplateId?: string | null;
  audienceFilter: BroadcastAudienceFilter;
  status: BroadcastStatus;
  totals: BroadcastTotals;
  /** UID of the user who triggered the send. */
  createdByUid: string;
  /** Display name + email of the trigger user — survives user deletion. */
  createdBy: {
    displayName: string;
    email: string;
  };
  createdAt: Timestamp | FieldValue | null;
  /**
   * Persistent Broadcast Drafts V1 (2026-08-27) — bumped on every autosave
   * and every status transition. Absent on broadcasts sent before this
   * pass (legacy docs never had a reason to track it); the list/detail
   * pages fall back to `createdAt` when it's missing. Drives the "last
   * edited" timestamp on Draft rows in the Broadcasts list.
   */
  updatedAt?: Timestamp | FieldValue | null;
  startedAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  /** Populated when status === "failed". */
  errorMessage: string | null;
  /**
   * Persistent Broadcast Drafts V1 (2026-08-27) — stale-write guard for
   * autosave. `lastSaveSessionId` identifies one composer-tab-load
   * (`crypto.randomUUID()`, generated once per mount); `lastSaveSeq` is
   * that session's own monotonically increasing autosave counter. The
   * draft-save route only accepts a write when the incoming
   * (sessionId, seq) is newer than what's stored — same session, higher
   * seq, OR a different session entirely (last-write-wins across tabs is
   * an accepted V1 tradeoff, see the route's own doc comment). This is
   * ONLY to stop a single tab's own debounced requests from applying out
   * of network-arrival-order; it is not real multi-tab conflict
   * resolution. Undefined/absent on every non-draft-flow doc (never set
   * by the send route, engagement webhook, etc.).
   */
  lastSaveSessionId?: string | null;
  lastSaveSeq?: number | null;
  /**
   * Production safety controls (2026-08-26). When true, /api/broadcasts/
   * email/send intersected the resolved audience with
   * `testRecipientContactIds` SERVER-SIDE before any row was ever written —
   * no contact outside the allowlist could have been queued, regardless of
   * how broad `audienceFilter` resolves. Kept on the doc as a permanent,
   * visible audit marker (the detail page badges it "TEST") — never
   * inferred from totals, since a real broadcast can also happen to have a
   * small audience.
   */
  testMode?: boolean;
  /** The allowlist a testMode broadcast was intersected against. Verified
   *  server-side at send time to belong to this subAccountId — see send/route.ts. */
  testRecipientContactIds?: string[] | null;
  /**
   * The audience size the operator saw and confirmed in the UI immediately
   * before clicking Send. /api/broadcasts/email/send recomputes the
   * audience from scratch server-side and rejects the request (409) if the
   * two counts don't match, forcing a fresh preview + re-confirmation
   * rather than ever queuing against a stale client-side count. Stored here
   * purely as an audit trail of what was confirmed.
   */
  confirmedAudienceSize?: number | null;
  /** Set when an operator cancels a queued/sending broadcast. */
  cancelledAt?: Timestamp | FieldValue | null;
  cancelledBy?: { displayName: string; email: string } | null;
}

/** Reasons the step executor skips a recipient WITHOUT calling Resend. */
export type BroadcastSkipReason =
  /** contact.emailOptedOut === true at send time. */
  | "opt_out"
  /** Contact has no email address (defensive — pre-filter usually catches this). */
  | "no_email"
  /** Send window outside the sub-account's configured hours (will defer + retry). */
  | "send_window_deferred"
  /** Contact was deleted between fan-out and send. */
  | "contact_missing"
  /** Broadcast was cancelled by an operator before this row's callback fired. */
  | "cancelled";

export type BroadcastSendStatus =
  | "queued"
  | "sent"
  | "skipped"
  | "failed";

export interface BroadcastSendDoc {
  id: string; // === contactId
  broadcastId: string;
  agencyId: string;
  subAccountId: string;
  contactId: string;
  /** Snapshot of the contact's email at fan-out time — audit even if contact deleted. */
  toEmail: string;
  /** Snapshot of the contact's display name. */
  toName: string;
  status: BroadcastSendStatus;
  skippedReason: BroadcastSkipReason | null;
  /** Resend message id once the send succeeds. */
  resendMessageId: string | null;
  /** Resend API error message when status === "failed". */
  error: string | null;
  /** Number of step-executor attempts for this row (capped to prevent retry storms). */
  attempts: number;
  queuedAt: Timestamp | FieldValue | null;
  sentAt: Timestamp | FieldValue | null;
  /**
   * Post-send engagement, populated asynchronously by the Resend events
   * webhook (matched back to this row via `resendMessageId` — see
   * src/lib/broadcasts/engagement-webhook.ts). Null until the first event
   * arrives, and stays null forever for `skipped`/`failed` rows (no
   * `resendMessageId` to match on). Orthogonal to `status`: `status` is the
   * send-attempt outcome, `engagement` is what happened after.
   */
  engagement: SendEngagement | null;
}

export interface SendEngagement {
  delivered: boolean;
  deliveredAt: Timestamp | FieldValue | null;
  opened: boolean;
  openedAt: Timestamp | FieldValue | null;
  openCount: number;
  clicked: boolean;
  clickedAt: Timestamp | FieldValue | null;
  clickCount: number;
  lastClickedUrl: string | null;
  bounced: boolean;
  bounceType: "hard" | "soft" | "undetermined" | null;
  bouncedAt: Timestamp | FieldValue | null;
  complained: boolean;
  complainedAt: Timestamp | FieldValue | null;
}
