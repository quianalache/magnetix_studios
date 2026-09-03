import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Workflow Builder — the general automation engine that replaces the legacy
 * single-recipe `automations` engine. A workflow is a TRIGGER + a graph of
 * NODES (linear with if/else branches). A RUN is one contact's enrollment
 * walking that graph; the QStash step worker advances it node by node.
 */

export type WorkflowStatus = "draft" | "active" | "paused";

/**
 * Re-enrollment policy, enforced at trigger time. "every_time" (the default
 * — absent on every pre-v2 doc) matches the original engine behavior;
 * "unless_active" skips contacts with a run currently running/waiting;
 * "once_ever" enrolls each contact at most once, ever. Test enrollments
 * bypass the policy.
 */
export type WorkflowReentry = "every_time" | "unless_active" | "once_ever";

export type WorkflowTriggerType =
  | "contact.created"
  | "contact.tag.added"
  | "form.submitted"
  | "pipeline.stage.changed"
  | "booking.created"
  | "booking.cancelled"
  | "booking.rescheduled"
  | "quote.accepted"
  | "quote.paid"
  | "message.received"
  | "contact.updated"
  | "contact.tag.removed"
  | "task.created"
  | "task.completed"
  | "deal.created"
  | "deal.won"
  | "deal.lost"
  | "booking.completed"
  | "booking.no_show"
  | "course.enrolled"
  | "course.lesson.completed"
  | "course.completed"
  | "offer.purchase.paid"
  | "offer.access.granted"
  | "offer.access.revoked"
  | "community.member.joined"
  | "community.member.approved"
  | "contact.field.changed"
  | "contact.source.changed"
  | "deal.amount.changed"
  | "deal.stage.changed"
  | "deal.updated"
  | "payment.succeeded"
  | "payment.failed"
  | "subscription.created"
  | "subscription.renewed"
  | "subscription.cancelled"
  | "subscription.paused"
  | "refund.issued"
  | "community.member.left"
  | "community.post.created"
  | "community.comment.created"
  | "community.event.started"
  | "community.event.ended"
  | "community.live.ended"
  | "community.replay.ready"
  | "message.sent"
  | "conversation.assigned"
  | "conversation.closed"
  | "conversation.reopened"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "scheduled.datetime"
  | "contact.date.reached"
  | "workflow.completed"
  | "workflow.failed";

/* ------------------------------ Conditions ----------------------------- */

export type ConditionOp =
  | "equals"
  | "not_equals"
  | "contains"
  // Broadcast Segmentation V1 (2026-08-27) — added for negation coverage
  // ("does not contain" / tag exclusion). Purely additive: every existing
  // condition doc using the ops above is unaffected.
  | "not_contains"
  | "is_set"
  | "not_set"
  | "has_tag"
  | "not_has_tag"
  | "in_stage"
  | "source_is";

export interface Condition {
  /** Contact field path (e.g. "email", "company", "customFields.x"). */
  field: string;
  op: ConditionOp;
  value?: string;
}

/**
 * A flat condition list. `match` picks the combinator: "all" (AND, the
 * default — absent on every pre-v2 doc) or "any" (OR). Nested groups stay
 * deferred.
 */
export interface ConditionGroup {
  all: Condition[];
  match?: "all" | "any";
}

/* -------------------------------- Trigger ------------------------------ */

export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  filters: ConditionGroup;
  /** Restrict `form.submitted` to one form. Null/absent = any form. */
  formId?: string | null;
  /** Restrict `pipeline.stage.changed` to one target stage. */
  toStage?: string | null;
  /**
   * Restrict `message.received` to one inbox channel
   * (sms | whatsapp | messenger | instagram). Null/absent = any channel.
   */
  channel?: string | null;
  /** Optional entity-specific narrowing, matched against event context. */
  ownerUid?: string | null;
  projectId?: string | null;
  pipelineId?: string | null;
  stageId?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  offerId?: string | null;
  groupId?: string | null;
  assignedToUid?: string | null;
}

/* --------------------------------- Nodes ------------------------------- */

export type WorkflowNodeType =
  | "send_email"
  | "send_sms"
  | "whatsapp_template"
  | "wait"
  | "wait_for_reply"
  | "if_else"
  | "goal"
  | "add_tag"
  | "remove_tag"
  | "move_stage"
  | "update_field"
  | "create_task"
  | "notify"
  | "webhook"
  | "create_contact"
  | "update_task"
  | "complete_task"
  | "create_deal"
  | "update_deal"
  | "grant_offer_access"
  | "enroll_course"
  | "start_workflow"
  | "revoke_offer_access"
  | "remove_course_access"
  | "grant_community_access"
  | "notify_community_member"
  | "assign_conversation"
  | "close_conversation"
  | "reopen_conversation"
  | "stop_workflow";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  /** Node-type-specific config (validated per type at execution). */
  config: Record<string, unknown>;
  /** Next node for a linear step. Null/absent ends the run. */
  next?: string | null;
  /**
   * Branch targets for a branching node. `if_else`: whenTrue = conditions
   * pass. `wait_for_reply`: whenTrue = the contact replied, whenFalse = the
   * timeout elapsed with no reply.
   */
  branches?: { whenTrue: string | null; whenFalse: string | null };
}

export interface WorkflowDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  status: WorkflowStatus;
  /** Null only for a newly-created blank draft before the user chooses a trigger. */
  trigger: WorkflowTrigger | null;
  /** Re-enrollment policy. Absent = "every_time". */
  reentry?: WorkflowReentry;
  /** Entry node id. Null = empty workflow (won't enroll). */
  startNodeId: string | null;
  nodes: Record<string, WorkflowNode>;
  stats: { enrolled: number; completed: number };
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* --------------------------------- Runs -------------------------------- */

export type WorkflowRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "exited";

export interface WorkflowRunHistoryEntry {
  nodeId: string;
  type: WorkflowNodeType;
  at: Timestamp | FieldValue | null;
  /**
   * "ok" | "skipped:<reason>" | "error:<msg>" | "branch:true|false" |
   * "replied:<channel>" | "timeout".
   */
  result: string;
  /** Structured execution metadata; absent on legacy history entries. */
  execution?: WorkflowActionExecution;
}

export type WorkflowActionResultStatus =
  | "success"
  | "skipped"
  | "retryable_failure"
  | "terminal_failure";

export interface WorkflowActionExecution {
  actionId: string;
  attempt: number;
  status: WorkflowActionResultStatus;
  errorCategory?: string | null;
  errorMessage?: string | null;
  referenceId?: string | null;
  at: Timestamp | FieldValue | null;
}

/**
 * Set while a run is parked on a `wait_for_reply` node. The inbound-message
 * hook resolves it early (Replied branch); the QStash timeout callback
 * resolves it late (No-reply branch). A transaction claims the node so
 * exactly one path wins; the winner appends the node's history entry, which
 * the step worker's idempotency guard then treats as terminal.
 */
export interface WorkflowRunWaiting {
  nodeId: string;
  kind: "reply";
  since: Timestamp | FieldValue | null;
  until: Timestamp | FieldValue | null;
}

export interface WorkflowRunDoc {
  id: string;
  subAccountId: string;
  agencyId: string;
  workflowId: string;
  contactId: string;
  status: WorkflowRunStatus;
  currentNodeId: string | null;
  /** Non-null while parked on a `wait_for_reply` node. */
  waiting?: WorkflowRunWaiting | null;
  history: WorkflowRunHistoryEntry[];
  /** Trigger payload snapshot (e.g. { formId, dealId }). */
  context: Record<string, unknown>;
  qstashMessageId: string | null;
  /** Durable per-node execution attempts; absent on legacy runs. */
  actionAttempts?: Record<string, number>;
  enrolledAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/* ------------------------ Node config (typed views) -------------------- */

export interface SendEmailConfig {
  subject: string;
  body: string;
  /** New actions default to marketing; absent means legacy compatibility mode. */
  emailType?: "marketing" | "transactional";
  /** Rich email-safe HTML, introduced additively; legacy steps use body. */
  bodyHtml?: string;
  /** Optional per-step display name; the verified sender address stays tenant-controlled. */
  fromName?: string;
  /** Optional overrides; blank values use the sub-account sending preferences. */
  replyTo?: string;
  cc?: string;
  bcc?: string;
}
export interface SendSmsConfig {
  body: string;
}
export interface WhatsappTemplateConfig {
  /** Approved WhatsApp template doc id (subAccounts/{id}/whatsappTemplates). */
  templateId: string;
  /**
   * Operator-set values for the template's MANUAL variables, keyed by position
   * (string keys for JSON). May contain merge tags; resolved at run time.
   * `merge_tag` variables auto-resolve from the contact and aren't stored here.
   */
  manualValues?: Record<string, string>;
}
export interface WaitConfig {
  seconds: number;
}
/** Timeout window for a `wait_for_reply` node. */
export interface WaitForReplyConfig {
  seconds: number;
}
export interface IfElseConfig {
  conditions: ConditionGroup;
}
export interface TagConfig {
  tag: string;
}
export interface MoveStageConfig {
  stage: string;
}
export interface UpdateFieldConfig {
  field: string;
  value: string;
}
export interface CreateTaskConfig {
  title: string;
  dueInDays?: number;
}
/** Who an Internal notification step emails. Legacy configs predate this
 *  field — the engine treats a missing value like "custom" (use `to`, else
 *  fall back to the agency owner) for backward compatibility. */
export type NotifyRecipient = "owner" | "account_contact" | "custom";

export interface NotifyConfig {
  /** Recipient mode. Optional so pre-existing stored configs still parse. */
  recipient?: NotifyRecipient;
  /** Literal email — only used when `recipient` is "custom" (or absent). */
  to: string;
  subject: string;
  body: string;
}
export interface WebhookConfig {
  url: string;
}

export interface WorkflowAccessConfig {
  offerId?: string;
  purchaseId?: string;
  courseId?: string;
  enrollmentId?: string;
}
export interface CommunityAccessConfig {
  groupId: string;
}
export interface ConversationAssignmentConfig {
  assigneeUid: string;
}
export interface StopWorkflowConfig {
  workflowId?: string;
}

export interface CreateContactConfig {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  source?: string;
  tags?: string[];
}
export interface TaskMutationConfig {
  taskId: string;
  title?: string;
  notes?: string;
  dueInDays?: number | null;
}
export interface CreateDealConfig {
  title: string;
  value?: number;
  currency?: string;
  stageId?: string;
  priority?: "high" | "medium" | "low";
}
export interface UpdateDealConfig {
  dealId: string;
  title?: string;
  value?: number;
  currency?: string;
  stageId?: string;
  priority?: "high" | "medium" | "low";
}
export interface CourseConfig {
  courseId: string;
}
export interface OfferAccessConfig {
  offerId: string;
  purchaseId: string;
}
export interface StartWorkflowConfig {
  workflowId: string;
}
