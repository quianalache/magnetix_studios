import type { Timestamp, FieldValue } from "firebase/firestore";
import type { BroadcastContent } from "./broadcast-content";

/**
 * Agency Communications — Magnetix Studios' own email broadcast/template
 * system, the agency-scope sibling of `broadcasts`/`broadcastTemplates`
 * (see src/types/broadcasts.ts). Lives entirely under `agencies/{agencyId}`
 * — never under a fake subAccount — and reuses the SAME block content
 * model, renderer, unsubscribe mechanism, and QStash fan-out pattern
 * tenant Broadcasts already use. The one deliberate divergence is the
 * audience model: tenant Broadcasts target CRM Contacts via a condition-
 * group segmentation engine; Agency Communications targets a small,
 * enumerable set of REAL Agency audiences (sub-account owners, plan
 * cohorts, Agency Community members, Agency course/offer buyers) — see
 * `AgencyAudienceSource` below, resolved by
 * agency-communications-audience-service.ts.
 *
 * Schema:
 *   agencies/{agencyId}/communications/{communicationId}
 *   agencies/{agencyId}/communications/{communicationId}/sends/{recipientId}
 *
 * `sends`' subcollection name is deliberately identical to tenant
 * Broadcasts' own `sends` subcollection — the existing Resend engagement
 * webhook (src/lib/broadcasts/engagement-webhook.ts) matches events back
 * to a row via a Firestore `collectionGroup("sends")` query, which spans
 * every `sends` subcollection in the database regardless of its parent
 * path. Naming this collection anything else would silently exclude
 * Agency sends from delivery/open/click tracking.
 */

export type AgencyCommunicationStatus =
  | "draft"
  | "queued"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled";

/** One selected audience source. Multiple sources may be combined on one
 *  communication — see agency-communications-audience-service.ts's
 *  dedup-by-email merge. */
export type AgencyAudienceSourceKind =
  | "subAccountOwners"
  | "planCohort"
  | "community"
  | "course"
  | "courseOffer";

export interface AgencyAudienceSource {
  kind: AgencyAudienceSourceKind;
  /** planCohort only — one or more `agencies/{agencyId}/plans/{id}` ids. */
  planIds?: string[];
  /** community only — one `agencies/{agencyId}/communityGroups/{id}` id. */
  groupId?: string;
  /** course only — one `agencies/{agencyId}/standaloneCourses/{id}` id. */
  courseId?: string;
  /** courseOffer only — one `agencies/{agencyId}/courseOffers/{id}` id. */
  offerId?: string;
}

export interface AgencyCommunicationTotals {
  audienceSize: number;
  queued: number;
  sent: number;
  skipped: number;
  failed: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
}

export interface AgencyCommunicationDoc {
  id: string;
  agencyId: string;
  subjectPreview: string;
  content?: BroadcastContent;
  emailDocument?: import("./email-document").EmailDocument;
  subject?: string;
  preheader?: string | null;
  sourceTemplateId?: string | null;
  audienceSources: AgencyAudienceSource[];
  status: AgencyCommunicationStatus;
  totals: AgencyCommunicationTotals;
  createdByUid: string;
  createdBy: { displayName: string; email: string };
  createdAt: Timestamp | FieldValue | null;
  updatedAt?: Timestamp | FieldValue | null;
  startedAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
  errorMessage: string | null;
  /** Draft autosave stale-write guard — mirrors BroadcastDoc's own fields. */
  lastSaveSessionId?: string | null;
  lastSaveSeq?: number | null;
  /** Test Send never sets any of these — see /api/agency/communications/test-send. */
  confirmedAudienceSize?: number | null;
  cancelledAt?: Timestamp | FieldValue | null;
  cancelledBy?: { displayName: string; email: string } | null;
}

export type AgencyCommunicationSkipReason =
  | "opted_out"
  | "no_email"
  | "recipient_missing"
  | "cancelled";

export type AgencyCommunicationSendStatus = "queued" | "sent" | "skipped" | "failed";

/**
 * One resolved recipient. Deliberately has NO `contactId` field (unlike
 * tenant `BroadcastSendDoc`) — this is the structural signal
 * engagement-webhook.ts uses to route hard-bounce/complaint suppression to
 * the Agency recipient-preferences model instead of a tenant Contact doc.
 * Doc id (`recipientId`) is the recipient's own lowercased email — the
 * dedup key across every audience source (see the audience service).
 */
export interface AgencyCommunicationSendDoc {
  id: string; // === lowercased recipient email
  communicationId: string;
  agencyId: string;
  recipientEmail: string;
  recipientName: string;
  /** Every audience source that resolved to this recipient — "explain
   *  why" metadata, e.g. ["Sub-account owners", "Course: Human Design 101"]. */
  matchedSources: string[];
  /** The underlying identity this recipient resolved from, for audit only
   *  — never used to re-derive access. */
  identity: { kind: "person" | "staffUser"; id: string };
  status: AgencyCommunicationSendStatus;
  skippedReason: AgencyCommunicationSkipReason | null;
  resendMessageId: string | null;
  error: string | null;
  attempts: number;
  queuedAt: Timestamp | FieldValue | null;
  sentAt: Timestamp | FieldValue | null;
  engagement: import("./broadcasts").SendEngagement | null;
}

/**
 * Agency-scope recipient marketing preferences — the sibling of a tenant
 * Contact's `emailOptedOut`/`deliverabilitySuppressed` fields, deliberately
 * NEVER stored on a tenant Contact (a recipient unsubscribing from Magnetix
 * Studios' own email must not touch any tenant business's marketing
 * preferences). Doc id is the recipient's lowercased email.
 */
export interface AgencyRecipientPreferenceDoc {
  id: string; // === lowercased email
  agencyId: string;
  emailOptedOut: boolean;
  deliverabilitySuppressed: boolean;
  deliverabilitySuppressedReason: "hard_bounce" | "complaint" | null;
  deliverabilitySuppressedAt: Timestamp | FieldValue | null;
  unsubscribedAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/** Agency Email Templates — `agencies/{agencyId}/emailTemplates/{id}`, a
 *  separate collection from tenant `broadcastTemplates` (not the same
 *  collection with a different scope field) so there is zero possibility
 *  of an Agency template appearing in any tenant template query, and vice
 *  versa. Field shape otherwise mirrors `BroadcastTemplateDoc`. */
export interface AgencyEmailTemplateDoc {
  id: string;
  agencyId: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
  emailDocument?: import("./email-document").EmailDocument;
  createdByUid: string;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
