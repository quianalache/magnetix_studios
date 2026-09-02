import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  sendEmail,
  emailIsConfigured,
  tenantFrom,
  sendTenantEmail,
} from "@/lib/comms/resend";
import {
  sendSmsForSubAccount,
  sendWhatsappTemplateForSubAccount,
  smsIsConfigured,
  subAccountTwilioIsConfigured,
  subAccountWhatsappIsConfigured,
} from "@/lib/comms/twilio";
import { agencyAllowsSharedSms } from "@/lib/agency/policy";
import { resolveTemplateVariables } from "@/lib/comms/whatsapp/resolve-template-variables";
import { createTaskServerSide } from "@/lib/server/tasks-service";
import { setTaskCompletedServerSide } from "@/lib/server/tasks-service";
import { createContactServerSide } from "@/lib/server/contacts-service";
import {
  createDealServerSide,
  updateDealServerSide,
} from "@/lib/server/deals-service";
import { enrollInStandaloneCourseServerSide } from "@/lib/server/standalone-course-service";
import { grantCourseOfferAccessServerSide } from "@/lib/server/course-offer-purchase-service";
import { updateConversationWorkflowState } from "@/lib/server/conversations-service";
import { joinGroupServerSide } from "@/lib/server/community-service";
import { createNotification } from "@/lib/server/notification-service";
import {
  resolveMergeTags,
  type MergeTagSubject,
} from "@/lib/automations/merge-tags";
import { buildUnsubscribeUrl } from "@/lib/automations/unsubscribe-token";
import { publishCallback, qstashIsConfigured } from "@/lib/automations/qstash";
import { evalConditionGroup } from "./conditions";
import type { Contact } from "@/types/contacts";
import type { AgencyDoc, SubAccountDoc } from "@/types";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";
import type {
  CreateTaskConfig,
  IfElseConfig,
  MoveStageConfig,
  NotifyConfig,
  SendEmailConfig,
  SendSmsConfig,
  TagConfig,
  WhatsappTemplateConfig,
  UpdateFieldConfig,
  WaitConfig,
  WaitForReplyConfig,
  WebhookConfig,
  WorkflowDoc,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowRunDoc,
  WorkflowRunHistoryEntry,
  WorkflowTriggerType,
  CreateContactConfig,
  TaskMutationConfig,
  CreateDealConfig,
  UpdateDealConfig,
  CourseConfig,
  OfferAccessConfig,
  StartWorkflowConfig,
  CommunityAccessConfig,
  ConversationAssignmentConfig,
  StopWorkflowConfig,
} from "@/types/workflows";
import type { PipelineStageId, DealPriority } from "@/types/deals";

const STEP_PATH = "/api/workflows/step";

/* --------------------------- Node executors ---------------------------- */

export type StepResult =
  | { kind: "next" }
  | { kind: "wait"; seconds: number }
  | { kind: "branch"; value: boolean }
  | { kind: "end" }
  | { kind: "fail"; retryable: boolean };

export type ActionExecutionStatus =
  | "success"
  | "skipped"
  | "retryable_failure"
  | "terminal_failure";
export interface ActionExecution {
  status: ActionExecutionStatus;
  errorCategory?: string;
  errorMessage?: string;
  referenceId?: string;
}

interface NodeContext {
  node: WorkflowNode;
  contact: Contact;
  subAccount: SubAccountDoc | null;
  owner: { displayName: string; email: string };
  subAccountId: string;
  agencyId: string;
  /** Workflow author — stamped on writes (tasks) for audit. */
  createdByUid: string;
  /**
   * The trigger context captured at enrollment (e.g. the submitted form's
   * answers under `formData`). Carried on the run doc; surfaced here so the
   * Webhook step can forward the form fields downstream.
   */
  triggerContext: Record<string, unknown>;
  workflowId: string;
  runId: string;
}

/** An executor returns the control-flow result + a short audit log string. */
type NodeExecutor = (
  ctx: NodeContext
) => Promise<{ result: StepResult; log: string; execution?: ActionExecution }>;

function mergeSubject(
  ctx: NodeContext,
  unsubscribeLink: string
): MergeTagSubject {
  return {
    contact: {
      name: ctx.contact.name,
      email: ctx.contact.email,
      phone: ctx.contact.phone,
    },
    owner: ctx.owner,
    workspace: { name: ctx.subAccount?.name ?? "" },
    bookingLink: ctx.subAccount?.bookingLink ?? "",
    unsubscribeLink,
  };
}

const execSendEmail: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as SendEmailConfig;
  const contact = ctx.contact;
  if (contact.emailOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.email;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_email" };
  if (!emailIsConfigured()) {
    return { result: { kind: "next" }, log: "error:email_not_configured" };
  }

  const unsubscribeLink = buildUnsubscribeUrl(contact.id);
  const subject = resolveMergeTags(
    cfg.subject ?? "",
    mergeSubject(ctx, unsubscribeLink)
  );
  const text = resolveMergeTags(
    cfg.body ?? "",
    mergeSubject(ctx, unsubscribeLink)
  );
  const htmlInner = resolveMergeTags(
    cfg.body ?? "",
    mergeSubject(ctx, `<a href="${unsubscribeLink}">Unsubscribe</a>`)
  ).replace(/\r?\n/g, "<br>");
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">${htmlInner}</body></html>`;

  try {
    await sendTenantEmail({
      sub: ctx.subAccount,
      to,
      subject: subject || "(no subject)",
      text,
      html,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch {
    return {
      result: { kind: "next" },
      log: "error:send_failed",
    };
  }
};

const execSendSms: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as SendSmsConfig;
  const contact = ctx.contact;
  if (contact.smsOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.phone;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_phone" };
  // Send via the sub-account's dedicated Twilio when configured, else the
  // shared env creds — same resolution the contact-profile SMS uses. The shared
  // fallback only counts when the agency still permits it.
  const hasSms =
    subAccountTwilioIsConfigured(ctx.subAccount?.twilioConfig) ||
    (smsIsConfigured() &&
      (await agencyAllowsSharedSms(ctx.subAccount?.agencyId)));
  if (!hasSms) {
    return { result: { kind: "next" }, log: "error:sms_not_configured" };
  }
  const body = resolveMergeTags(cfg.body ?? "", mergeSubject(ctx, ""));
  try {
    await sendSmsForSubAccount({
      subAccountId: ctx.subAccountId,
      subAccount: ctx.subAccount,
      to,
      body,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch {
    return {
      result: { kind: "next" },
      log: "error:send_failed",
    };
  }
};

const execWhatsappTemplate: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as WhatsappTemplateConfig;
  const contact = ctx.contact;
  if (contact.whatsappOptedOut)
    return { result: { kind: "next" }, log: "skipped:opt_out" };
  const to = contact.phone;
  if (!to) return { result: { kind: "next" }, log: "skipped:no_phone" };
  // Requires the agency WhatsApp gate AND a configured WhatsApp sender. The
  // builder surfaces this as a red node, but re-check here in case the gate
  // flipped off after the workflow was built.
  if (
    ctx.subAccount?.whatsappEnabledByAgency !== true ||
    !subAccountWhatsappIsConfigured(ctx.subAccount?.twilioConfig)
  ) {
    return { result: { kind: "next" }, log: "error:whatsapp_not_configured" };
  }
  if (!cfg.templateId)
    return { result: { kind: "next" }, log: "skipped:no_template" };

  const tplSnap = await getAdminDb()
    .doc(`subAccounts/${ctx.subAccountId}/whatsappTemplates/${cfg.templateId}`)
    .get();
  const tpl = tplSnap.exists ? (tplSnap.data() as WhatsappTemplateDoc) : null;
  if (!tpl || tpl.status !== "approved" || !tpl.contentSid) {
    // Template was deleted, never approved, or lost approval (paused/disabled).
    return { result: { kind: "next" }, log: "error:template_not_approved" };
  }

  const subject = mergeSubject(ctx, "");
  // Operator-set MANUAL variable values may contain merge tags — resolve them
  // against the contact before handing to the positional resolver.
  const manualValues: Record<number, string> = {};
  for (const [pos, val] of Object.entries(cfg.manualValues ?? {})) {
    manualValues[Number(pos)] = resolveMergeTags(val ?? "", subject);
  }
  const contentVariables = resolveTemplateVariables({
    variables: tpl.variables,
    subject,
    manualValues,
  });

  try {
    await sendWhatsappTemplateForSubAccount({
      subAccountId: ctx.subAccountId,
      subAccount: ctx.subAccount,
      to,
      contentSid: tpl.contentSid,
      contentVariables,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch {
    return {
      result: { kind: "next" },
      log: "error:send_failed",
    };
  }
};

const execWait: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as WaitConfig;
  const seconds = Math.max(0, Math.floor(cfg.seconds ?? 0));
  return { result: { kind: "wait", seconds }, log: `wait:${seconds}s` };
};

const execIfElse: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as IfElseConfig;
  const pass = evalConditionGroup(cfg.conditions, ctx.contact);
  return { result: { kind: "branch", value: pass }, log: `branch:${pass}` };
};

const execGoal: NodeExecutor = async () => ({
  result: { kind: "end" },
  log: "goal",
});

const execAddTag: NodeExecutor = async (ctx) => {
  const tag = ((ctx.node.config as unknown as TagConfig).tag ?? "").trim();
  if (!tag) return { result: { kind: "next" }, log: "skipped:no_tag" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      tags: FieldValue.arrayUnion(tag),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `tag+:${tag}` };
};

const execRemoveTag: NodeExecutor = async (ctx) => {
  const tag = ((ctx.node.config as unknown as TagConfig).tag ?? "").trim();
  if (!tag) return { result: { kind: "next" }, log: "skipped:no_tag" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      tags: FieldValue.arrayRemove(tag),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `tag-:${tag}` };
};

const execMoveStage: NodeExecutor = async (ctx) => {
  const stage = (
    (ctx.node.config as unknown as MoveStageConfig).stage ?? ""
  ).trim();
  if (!stage) return { result: { kind: "next" }, log: "skipped:no_stage" };
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({ pipelineStage: stage, updatedAt: FieldValue.serverTimestamp() });
  return { result: { kind: "next" }, log: `stage:${stage}` };
};

// Only these top-level contact fields may be set by a workflow — prevents a
// crafted config from clobbering tenancy/system keys. customFields.* is open.
const WRITABLE_FIELDS = new Set([
  "name",
  "email",
  "phone",
  "company",
  "source",
  "pipelineStage",
]);

const execUpdateField: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as UpdateFieldConfig;
  const field = (cfg.field ?? "").trim();
  if (!field) return { result: { kind: "next" }, log: "skipped:no_field" };
  if (!field.startsWith("customFields.") && !WRITABLE_FIELDS.has(field)) {
    return { result: { kind: "next" }, log: "skipped:field_not_writable" };
  }
  await getAdminDb()
    .doc(`contacts/${ctx.contact.id}`)
    .update({
      [field]: cfg.value ?? "",
      updatedAt: FieldValue.serverTimestamp(),
    });
  return { result: { kind: "next" }, log: `field:${field}` };
};

const execCreateTask: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CreateTaskConfig;
  const title =
    resolveMergeTags(cfg.title ?? "Follow up", mergeSubject(ctx, "")) ||
    "Follow up";
  const dueAt =
    cfg.dueInDays && cfg.dueInDays > 0
      ? new Date(Date.now() + cfg.dueInDays * 86_400_000)
      : null;
  await createTaskServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    createdByUid: ctx.createdByUid,
    mode: "live",
    title,
    notes: "Created by workflow",
    dueAt,
    contactId: ctx.contact.id,
    dealId: null,
    eventId: null,
  });
  return { result: { kind: "next" }, log: "task_created" };
};

/**
 * Resolve who an Internal notification emails. "account_contact" reads the
 * sub-account's primary contact (Settings → Admin → Account contact); a custom
 * email is used as typed. The agency owner is the ultimate fallback so a
 * notification is never silently dropped — including when "account_contact" is
 * chosen but that contact has no email set.
 */
function resolveNotifyTo(cfg: NotifyConfig, ctx: NodeContext): string {
  const owner = ctx.owner.email;
  switch (cfg.recipient) {
    case "owner":
      return owner;
    case "account_contact":
      return ctx.subAccount?.accountContact?.email?.trim() || owner;
    // "custom" and legacy (undefined) both use the typed email, else owner.
    default:
      return (cfg.to ?? "").trim() || owner;
  }
}

const execNotify: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as NotifyConfig;
  const to = resolveNotifyTo(cfg, ctx);
  if (!to) return { result: { kind: "next" }, log: "skipped:no_recipient" };
  if (!emailIsConfigured()) {
    return { result: { kind: "next" }, log: "error:email_not_configured" };
  }
  const subject = resolveMergeTags(
    cfg.subject ?? "Workflow notification",
    mergeSubject(ctx, "")
  );
  const text = resolveMergeTags(cfg.body ?? "", mergeSubject(ctx, ""));
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">${text.replace(
    /\r?\n/g,
    "<br>"
  )}</body></html>`;
  try {
    await sendEmail({
      to,
      subject: subject || "Workflow notification",
      text,
      html,
      from: tenantFrom(ctx.subAccount),
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch {
    return {
      result: { kind: "next" },
      log: "error:send_failed",
    };
  }
};

const execWebhook: NodeExecutor = async (ctx) => {
  const url = ((ctx.node.config as unknown as WebhookConfig).url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return { result: { kind: "next" }, log: "skipped:bad_url" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  // The submitted form's answers (label → value), captured at enrollment.
  // Empty {} for triggers that don't carry a form (e.g. pipeline change, test).
  const tc = ctx.triggerContext ?? {};
  const formData =
    tc.formData && typeof tc.formData === "object"
      ? (tc.formData as Record<string, unknown>)
      : {};
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "workflow.webhook",
        contact: {
          id: ctx.contact.id,
          name: ctx.contact.name,
          email: ctx.contact.email,
          phone: ctx.contact.phone,
        },
        form: {
          id: typeof tc.formId === "string" ? tc.formId : null,
          name: typeof tc.formName === "string" ? tc.formName : null,
          fields: formData,
        },
      }),
      signal: controller.signal,
    });
    return { result: { kind: "next" }, log: "ok" };
  } catch {
    return {
      result: { kind: "next" },
      log: "error:webhook_failed",
    };
  } finally {
    clearTimeout(timer);
  }
};

function requiredString(value: unknown, name: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${name}_required`);
  return result;
}

async function memberForContact(
  subAccountId: string,
  contactId: string
): Promise<string> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/members`)
    .where("contactId", "==", contactId)
    .limit(1)
    .get();
  if (snap.empty) throw new Error("member_not_found");
  return snap.docs[0].id;
}

const execCreateContact: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CreateContactConfig;
  const created = await createContactServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    createdByUid: ctx.createdByUid,
    mode: "live",
    name: (cfg.name ?? "").trim(),
    email: (cfg.email ?? "").trim(),
    phone: (cfg.phone ?? "").trim(),
    company: (cfg.company ?? "").trim(),
    address: (cfg.address ?? "").trim(),
    source: (cfg.source ?? "workflow").trim(),
    tags: Array.isArray(cfg.tags) ? cfg.tags : [],
  });
  return {
    result: { kind: "next" },
    log: `contact_created:${created.id}`,
    execution: { status: "success", referenceId: created.id },
  };
};

const execUpdateTask: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as TaskMutationConfig;
  const taskId = requiredString(cfg.taskId, "task_id");
  const ref = getAdminDb().doc(`tasks/${taskId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== ctx.subAccountId)
    throw new Error("task_not_found");
  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (cfg.title !== undefined) patch.title = cfg.title.trim();
  if (cfg.notes !== undefined) patch.notes = cfg.notes;
  if (cfg.dueInDays !== undefined)
    patch.dueAt =
      cfg.dueInDays == null
        ? null
        : new Date(Date.now() + Math.max(0, cfg.dueInDays) * 86_400_000);
  await ref.set(patch, { merge: true });
  return {
    result: { kind: "next" },
    log: `task_updated:${taskId}`,
    execution: { status: "success", referenceId: taskId },
  };
};

const execCompleteTask: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as TaskMutationConfig;
  const taskId = requiredString(cfg.taskId, "task_id");
  const result = await setTaskCompletedServerSide({
    taskId,
    completed: true,
    userId: ctx.createdByUid,
    mode: "live",
    expectedSubAccountId: ctx.subAccountId,
  });
  if (!result) throw new Error("task_not_found");
  return {
    result: { kind: "next" },
    log: `task_completed:${taskId}`,
    execution: { status: "success", referenceId: taskId },
  };
};

const execCreateDeal: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CreateDealConfig;
  const deal = await createDealServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    createdByUid: ctx.createdByUid,
    mode: "live",
    title: requiredString(cfg.title, "deal_title"),
    value: Number(cfg.value ?? 0),
    currency: cfg.currency ?? "USD",
    contactId: ctx.contact.id,
    stageId: (cfg.stageId ?? "new") as PipelineStageId,
    priority: (cfg.priority ?? "medium") as DealPriority,
  });
  return {
    result: { kind: "next" },
    log: `deal_created:${deal.id}`,
    execution: { status: "success", referenceId: deal.id },
  };
};

const execUpdateDeal: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as UpdateDealConfig;
  const dealId = requiredString(cfg.dealId, "deal_id");
  const result = await updateDealServerSide({
    dealId,
    userId: ctx.createdByUid,
    expectedSubAccountId: ctx.subAccountId,
    mode: "live",
    patch: {
      ...(cfg.title !== undefined ? { title: cfg.title } : {}),
      ...(cfg.value !== undefined ? { value: Number(cfg.value) } : {}),
      ...(cfg.currency !== undefined ? { currency: cfg.currency } : {}),
      ...(cfg.stageId !== undefined
        ? { stageId: cfg.stageId as PipelineStageId }
        : {}),
      ...(cfg.priority !== undefined
        ? { priority: cfg.priority as DealPriority }
        : {}),
    },
  });
  if (!result) throw new Error("deal_not_found");
  return {
    result: { kind: "next" },
    log: `deal_updated:${dealId}`,
    execution: { status: "success", referenceId: dealId },
  };
};

const execGrantOfferAccess: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as OfferAccessConfig;
  const offerId = requiredString(cfg.offerId, "offer_id");
  const purchaseId = requiredString(cfg.purchaseId, "purchase_id");
  const purchase = await getAdminDb()
    .doc(
      `subAccounts/${ctx.subAccountId}/courseOffers/${offerId}/purchases/${purchaseId}`
    )
    .get();
  if (!purchase.exists || purchase.data()?.agencyId !== ctx.agencyId)
    throw new Error("purchase_not_found");
  const memberId = purchase.data()?.memberId as string | undefined;
  const member = memberId
    ? await getAdminDb()
        .doc(`subAccounts/${ctx.subAccountId}/members/${memberId}`)
        .get()
    : null;
  if (!member?.exists || member.data()?.contactId !== ctx.contact.id)
    throw new Error("purchase_contact_mismatch");
  await grantCourseOfferAccessServerSide({
    subAccountId: ctx.subAccountId,
    offerId,
    purchaseId,
    grantedByUid: ctx.createdByUid,
  });
  return {
    result: { kind: "next" },
    log: `offer_access_granted:${offerId}`,
    execution: { status: "success", referenceId: purchaseId },
  };
};

const execEnrollCourse: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CourseConfig;
  const courseId = requiredString(cfg.courseId, "course_id");
  const memberId = await memberForContact(ctx.subAccountId, ctx.contact.id);
  await enrollInStandaloneCourseServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    courseId,
    memberId,
  });
  return {
    result: { kind: "next" },
    log: `course_enrolled:${courseId}`,
    execution: { status: "success", referenceId: courseId },
  };
};

const MAX_WORKFLOW_CHAIN_DEPTH = 5;

async function startWorkflowForContact(opts: {
  workflowId: string;
  contactId: string;
  subAccountId: string;
  sourceWorkflowId: string;
  sourceRunId: string;
  chainDepth: number;
}): Promise<string> {
  if (opts.workflowId === opts.sourceWorkflowId)
    throw new Error("workflow_self_invocation");
  if (opts.chainDepth >= MAX_WORKFLOW_CHAIN_DEPTH)
    throw new Error("workflow_chain_depth_exceeded");
  const snap = await getAdminDb().doc(`workflows/${opts.workflowId}`).get();
  if (!snap.exists) throw new Error("workflow_not_found");
  const wf = { id: snap.id, ...(snap.data() as Omit<WorkflowDoc, "id">) };
  if (wf.subAccountId !== opts.subAccountId || wf.status !== "active")
    throw new Error("workflow_not_active");
  if (!wf.startNodeId) throw new Error("workflow_has_no_steps");
  if (!(await reentryAllows(wf, opts.contactId))) return "skipped:reentry";
  await enroll(wf, opts.contactId, {
    source: "workflow",
    sourceWorkflowId: opts.sourceWorkflowId,
    sourceRunId: opts.sourceRunId,
    chainDepth: opts.chainDepth + 1,
  });
  return "started";
}

const execStartWorkflow: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as StartWorkflowConfig;
  const workflowId = requiredString(cfg.workflowId, "workflow_id");
  const depth = Number(ctx.triggerContext.chainDepth ?? 0);
  const status = await startWorkflowForContact({
    workflowId,
    contactId: ctx.contact.id,
    subAccountId: ctx.subAccountId,
    sourceWorkflowId: ctx.workflowId,
    sourceRunId: ctx.runId,
    chainDepth: Number.isFinite(depth) ? depth : 0,
  });
  return {
    result: { kind: "next" },
    log: `workflow_${status}`,
    execution: {
      status: status === "started" ? "success" : "skipped",
      referenceId: workflowId,
    },
  };
};

const execGrantCommunityAccess: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as CommunityAccessConfig;
  const groupId = requiredString(cfg.groupId, "group_id");
  const memberId = await memberForContact(ctx.subAccountId, ctx.contact.id);
  const result = await joinGroupServerSide({
    subAccountId: ctx.subAccountId,
    agencyId: ctx.agencyId,
    groupId,
    memberId,
  });
  if (result.status === "payment_required")
    throw new Error("community_payment_required");
  return {
    result: { kind: "next" },
    log: `community_access_${result.status}`,
    execution: {
      status: result.status === "already" ? "skipped" : "success",
      referenceId: groupId,
    },
  };
};

const execNotifyCommunityMember: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as { title?: string; body?: string };
  const memberId = await memberForContact(ctx.subAccountId, ctx.contact.id);
  const member = await getAdminDb()
    .doc(`subAccounts/${ctx.subAccountId}/members/${memberId}`)
    .get();
  const personId = member.data()?.personId as string | undefined;
  if (!personId) return { result: { kind: "next" }, log: "skipped:no_person" };
  await createNotification({
    personId,
    subAccountId: ctx.subAccountId,
    eventType: "community.mention",
    objectType: "community",
    objectId: null,
    actorMemberId: memberId,
    title: cfg.title?.trim() || "Community update",
    message: cfg.body?.trim() || null,
    destination: `/community/${ctx.subAccountId}`,
    sourceObjectId: `${ctx.runId}:${ctx.node.id}`,
  });
  return { result: { kind: "next" }, log: "community_member_notified" };
};

const execConversationAction: NodeExecutor = async (ctx) => {
  const type = ctx.node.type;
  const cfg = ctx.node.config as unknown as ConversationAssignmentConfig;
  const ok = await updateConversationWorkflowState({
    contactId: ctx.contact.id,
    subAccountId: ctx.subAccountId,
    status:
      type === "close_conversation"
        ? "closed"
        : type === "reopen_conversation"
          ? "open"
          : undefined,
    assigneeUid:
      type === "assign_conversation"
        ? requiredString(cfg.assigneeUid, "assignee_uid")
        : undefined,
  });
  if (!ok) throw new Error("conversation_not_found");
  return {
    result: { kind: "next" },
    log: `conversation_${type.replace("_conversation", "")}`,
  };
};

const execStopWorkflow: NodeExecutor = async (ctx) => {
  const cfg = ctx.node.config as unknown as StopWorkflowConfig;
  const targetId = (cfg.workflowId ?? ctx.workflowId).trim();
  const snap = await getAdminDb()
    .collection("workflowRuns")
    .where("subAccountId", "==", ctx.subAccountId)
    .where("contactId", "==", ctx.contact.id)
    .where("workflowId", "==", targetId)
    .get();
  const active = snap.docs.filter((d) =>
    ["running", "waiting"].includes((d.data() as WorkflowRunDoc).status)
  );
  await Promise.all(
    active.map((d) =>
      d.ref.update({
        status: "exited",
        waiting: null,
        currentNodeId: null,
        stoppedByWorkflowRunId: ctx.runId,
        stoppedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    )
  );
  return { result: { kind: "next" }, log: `workflow_stopped:${active.length}` };
};

/** Unimplemented node types pass through (no stall) until their slice lands. */
const execPassThrough: NodeExecutor = async () => ({
  result: { kind: "next" },
  log: "unsupported_passthrough",
});

const REGISTRY: Partial<Record<WorkflowNodeType, NodeExecutor>> = {
  send_email: execSendEmail,
  send_sms: execSendSms,
  whatsapp_template: execWhatsappTemplate,
  wait: execWait,
  if_else: execIfElse,
  goal: execGoal,
  add_tag: execAddTag,
  remove_tag: execRemoveTag,
  move_stage: execMoveStage,
  update_field: execUpdateField,
  create_task: execCreateTask,
  notify: execNotify,
  webhook: execWebhook,
  create_contact: execCreateContact,
  update_task: execUpdateTask,
  complete_task: execCompleteTask,
  create_deal: execCreateDeal,
  update_deal: execUpdateDeal,
  grant_offer_access: execGrantOfferAccess,
  enroll_course: execEnrollCourse,
  start_workflow: execStartWorkflow,
  grant_community_access: execGrantCommunityAccess,
  notify_community_member: execNotifyCommunityMember,
  assign_conversation: execConversationAction,
  close_conversation: execConversationAction,
  reopen_conversation: execConversationAction,
  stop_workflow: execStopWorkflow,
};

/* ----------------------------- Dispatch -------------------------------- */

interface FireInput {
  subAccountId: string;
  agencyId: string;
  type: WorkflowTriggerType;
  contactId: string;
  context?: Record<string, unknown>;
}

/**
 * Find every ACTIVE workflow matching the trigger + filters and enroll the
 * contact. Server-only; never throws — a workflow problem must not break the
 * action that triggered it.
 */
export async function fireWorkflowTrigger(input: FireInput): Promise<void> {
  const db = getAdminDb();
  try {
    const subSnap = await db.doc(`subAccounts/${input.subAccountId}`).get();
    if (subSnap.data()?.automationsPaused === true) return;

    const matches = await db
      .collection("workflows")
      .where("subAccountId", "==", input.subAccountId)
      .where("status", "==", "active")
      .where("trigger.type", "==", input.type)
      .get();
    if (matches.empty) return;

    const contactSnap = await db.doc(`contacts/${input.contactId}`).get();
    if (!contactSnap.exists) return;
    const contact = {
      id: contactSnap.id,
      ...(contactSnap.data() as Omit<Contact, "id">),
    };

    for (const doc of matches.docs) {
      const wf = { id: doc.id, ...(doc.data() as Omit<WorkflowDoc, "id">) };
      if (!wf.startNodeId) continue;
      if (
        (input.type === "workflow.completed" ||
          input.type === "workflow.failed") &&
        input.context?.sourceWorkflowId === wf.id
      )
        continue;

      // Trigger-specific narrowing.
      if (
        wf.trigger.type === "form.submitted" &&
        wf.trigger.formId &&
        wf.trigger.formId !== input.context?.formId
      ) {
        continue;
      }
      if (
        wf.trigger.type === "pipeline.stage.changed" &&
        wf.trigger.toStage &&
        wf.trigger.toStage !== input.context?.toStage
      ) {
        continue;
      }
      if (
        wf.trigger.type === "message.received" &&
        wf.trigger.channel &&
        wf.trigger.channel !== input.context?.channel
      ) {
        continue;
      }
      const filterPairs: [keyof WorkflowDoc["trigger"], string][] = [
        ["ownerUid", "ownerUid"],
        ["projectId", "projectId"],
        ["pipelineId", "pipelineId"],
        ["stageId", "stageId"],
        ["courseId", "courseId"],
        ["lessonId", "lessonId"],
        ["offerId", "offerId"],
        ["groupId", "groupId"],
        ["assignedToUid", "assignedToUid"],
      ];
      if (
        filterPairs.some(
          ([key, contextKey]) =>
            wf.trigger[key] && wf.trigger[key] !== input.context?.[contextKey]
        )
      )
        continue;
      if (!evalConditionGroup(wf.trigger.filters, contact)) continue;
      if (!(await reentryAllows(wf, contact.id))) continue;

      const eventId =
        typeof input.context?.eventId === "string"
          ? input.context.eventId
          : null;
      if (eventId) {
        const prior = await db
          .collection("workflowRuns")
          .where("workflowId", "==", wf.id)
          .where("contactId", "==", contact.id)
          .get();
        if (
          prior.docs.some(
            (d) => (d.data() as WorkflowRunDoc).context?.eventId === eventId
          )
        )
          continue;
      }

      const deduplicationKey =
        typeof input.context?.deduplicationKey === "string"
          ? input.context.deduplicationKey
          : null;
      if (deduplicationKey) {
        const prior = await db
          .collection("workflowRuns")
          .where("workflowId", "==", wf.id)
          .where("contactId", "==", contact.id)
          .get();
        if (
          prior.docs.some(
            (d) =>
              (d.data() as WorkflowRunDoc).context?.deduplicationKey ===
              deduplicationKey
          )
        )
          continue;
      }

      await enroll(wf, contact.id, input.context ?? {});
    }
  } catch (err) {
    console.error("[workflows] fireWorkflowTrigger failed", err);
  }
}

/**
 * Enforce the workflow's re-enrollment policy. "every_time" (default, incl.
 * every pre-v2 doc) never blocks. Equality-only query + in-memory status
 * filter — a contact rarely has more than a handful of runs per workflow.
 * Fails open: an unexpected read error must not silently kill enrollments.
 */
async function reentryAllows(
  wf: WorkflowDoc,
  contactId: string
): Promise<boolean> {
  const policy = wf.reentry ?? "every_time";
  if (policy === "every_time") return true;
  try {
    const snap = await getAdminDb()
      .collection("workflowRuns")
      .where("workflowId", "==", wf.id)
      .where("contactId", "==", contactId)
      .get();
    if (snap.empty) return true;
    if (policy === "once_ever") return false;
    // unless_active — block only while a run is live.
    return !snap.docs.some((d) => {
      const s = (d.data() as WorkflowRunDoc).status;
      return s === "running" || s === "waiting";
    });
  } catch (err) {
    console.warn("[workflows] reentry check failed — allowing", err);
    return true;
  }
}

async function enroll(
  wf: WorkflowDoc,
  contactId: string,
  context: Record<string, unknown>
): Promise<void> {
  const db = getAdminDb();
  const runRef = db.collection("workflowRuns").doc();
  await runRef.set({
    id: runRef.id,
    subAccountId: wf.subAccountId,
    agencyId: wf.agencyId,
    workflowId: wf.id,
    contactId,
    status: "running",
    currentNodeId: wf.startNodeId,
    history: [],
    context,
    qstashMessageId: null,
    enrolledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db
    .doc(`workflows/${wf.id}`)
    .update({ "stats.enrolled": FieldValue.increment(1) })
    .catch(() => {});

  if (!qstashIsConfigured()) {
    await runRef.update({ status: "failed" });
    void fireWorkflowTrigger({
      subAccountId: wf.subAccountId,
      agencyId: wf.agencyId,
      type: "workflow.failed",
      contactId,
      context: {
        eventId: `${runRef.id}:failed`,
        workflowId: wf.id,
        runId: runRef.id,
        sourceWorkflowId: wf.id,
      },
    });
    return;
  }
  await scheduleNode(runRef, wf.startNodeId!, 0);
}

/* ------------------------------ Run worker ----------------------------- */

async function scheduleNode(
  runRef: FirebaseFirestore.DocumentReference,
  nodeId: string,
  delaySeconds: number
): Promise<void> {
  const res = await publishCallback({
    pathname: STEP_PATH,
    body: { runId: runRef.id, nodeId },
    delaySeconds,
    deduplicationId: `wf_${runRef.id}_${nodeId}`,
  });
  if (!res) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  await runRef.update({
    currentNodeId: nodeId,
    status: delaySeconds > 0 ? "waiting" : "running",
    qstashMessageId: res.messageId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function completeRun(
  runRef: FirebaseFirestore.DocumentReference,
  workflowId: string
): Promise<void> {
  await runRef.update({
    status: "completed",
    currentNodeId: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await getAdminDb()
    .doc(`workflows/${workflowId}`)
    .update({ "stats.completed": FieldValue.increment(1) })
    .catch(() => {});
  const snap = await runRef.get();
  const run = snap.data() as WorkflowRunDoc | undefined;
  if (run)
    void fireWorkflowTrigger({
      subAccountId: run.subAccountId,
      agencyId: run.agencyId,
      type: "workflow.completed",
      contactId: run.contactId,
      context: {
        eventId: `${run.id}:completed`,
        workflowId,
        runId: run.id,
        sourceWorkflowId: workflowId,
      },
    });
}

/** Advance one node of a run. Idempotent on the run's history. */
export async function runStep(
  runId: string,
  nodeId: string,
  phase?: "timeout"
): Promise<void> {
  const db = getAdminDb();
  const runRef = db.collection("workflowRuns").doc(runId);
  const runSnap = await runRef.get();
  if (!runSnap.exists) return;
  const run = runSnap.data() as WorkflowRunDoc;

  if (run.status !== "running" && run.status !== "waiting") return;
  if (run.history.some((h) => h.nodeId === nodeId)) return; // QStash retry

  const wfSnap = await db.doc(`workflows/${run.workflowId}`).get();
  if (!wfSnap.exists) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const wf = wfSnap.data() as WorkflowDoc;
  // Test runs execute regardless of status so a draft can be dry-run; real
  // enrollments require the workflow to still be active.
  if (wf.status !== "active" && run.context?.test !== true) {
    await runRef.update({
      status: "exited",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const node = wf.nodes[nodeId];
  if (!node) {
    await completeRun(runRef, wf.id);
    return;
  }

  // wait_for_reply is a two-phase node handled outside the registry: it arms
  // (parks the run + schedules a timeout), then is resolved EITHER by the
  // inbound-message hook (Replied) or the timeout callback (No reply).
  if (node.type === "wait_for_reply") {
    await stepWaitForReply(runRef, run, wf, node, phase);
    return;
  }

  const contactSnap = await db.doc(`contacts/${run.contactId}`).get();
  if (!contactSnap.exists) {
    await runRef.update({
      status: "failed",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const contact = {
    id: contactSnap.id,
    ...(contactSnap.data() as Omit<Contact, "id">),
  };

  const [subSnap, agencySnap] = await Promise.all([
    db.doc(`subAccounts/${run.subAccountId}`).get(),
    db.doc(`agencies/${run.agencyId}`).get(),
  ]);
  const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;
  const agency = agencySnap.exists ? (agencySnap.data() as AgencyDoc) : null;

  if (subAccount?.automationsPaused === true) {
    await runRef.update({
      status: "exited",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const owner = await loadOwner(agency);
  const exec = REGISTRY[node.type] ?? execPassThrough;
  let result: StepResult;
  let log: string;
  let execution: ActionExecution | undefined;
  try {
    ({ result, log, execution } = await exec({
      node,
      contact,
      subAccount,
      owner,
      subAccountId: run.subAccountId,
      agencyId: run.agencyId,
      createdByUid: wf.createdByUid,
      triggerContext: run.context ?? {},
      workflowId: wf.id,
      runId: run.id,
    }));
  } catch (err) {
    const code = err instanceof Error ? err.message : "action_failed";
    result = { kind: "fail", retryable: false };
    log = `error:${code}`;
    execution = {
      status: "terminal_failure",
      errorCategory: code,
      errorMessage: code,
    };
  }

  const entry: WorkflowRunHistoryEntry = {
    nodeId,
    type: node.type,
    at: Timestamp.now(),
    result: log,
    execution: {
      actionId: nodeId,
      attempt: 1,
      status:
        execution?.status ??
        (log.startsWith("skipped:")
          ? "skipped"
          : log.startsWith("error:")
            ? "retryable_failure"
            : "success"),
      errorCategory:
        execution?.errorCategory ??
        (log.startsWith("error:") ? log.slice("error:".length) : null),
      errorMessage: execution?.errorMessage ?? null,
      referenceId: execution?.referenceId ?? null,
      at: Timestamp.now(),
    },
  };
  if (result.kind === "fail") {
    await runRef.update({
      status: "failed",
      history: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
    });
    void fireWorkflowTrigger({
      subAccountId: run.subAccountId,
      agencyId: run.agencyId,
      type: "workflow.failed",
      contactId: run.contactId,
      context: {
        eventId: `${run.id}:failed:${nodeId}`,
        workflowId: wf.id,
        runId: run.id,
        sourceWorkflowId: wf.id,
        nodeId,
      },
    });
    return;
  }
  await runRef.update({
    history: FieldValue.arrayUnion(entry),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Advance control flow.
  let target: string | null = null;
  let delay = 0;
  if (result.kind === "end") {
    await completeRun(runRef, wf.id);
    return;
  } else if (result.kind === "branch") {
    const b = node.branches;
    target = (result.value ? b?.whenTrue : b?.whenFalse) ?? null;
  } else if (result.kind === "wait") {
    target = node.next ?? null;
    delay = result.seconds;
  } else {
    target = node.next ?? null;
  }

  if (!target) {
    await completeRun(runRef, wf.id);
    return;
  }
  await scheduleNode(runRef, target, delay);
}

/* --------------------------- wait_for_reply ---------------------------- */

/**
 * Two-phase wait_for_reply.
 *
 * Arm (first entry, `phase` absent): stamp `run.waiting`, park the run as
 * "waiting", and schedule a timeout callback that re-enters this SAME node
 * with `phase: "timeout"`. No history entry is appended — the history entry
 * IS the resolution marker, and appending it here would make the step
 * worker's idempotency guard treat the node as already resolved.
 *
 * Timeout (`phase === "timeout"`): claim the node in a transaction — a reply
 * may have resolved it first (the claim re-checks `waiting` + history inside
 * the transaction, so exactly one path wins). On claim, advance to the
 * No-reply branch.
 *
 * A QStash retry of the ARM message re-runs the arm path: the timeout
 * publish is deduplicated by id and the `waiting` re-stamp is idempotent.
 */
async function stepWaitForReply(
  runRef: FirebaseFirestore.DocumentReference,
  run: WorkflowRunDoc,
  wf: WorkflowDoc,
  node: WorkflowNode,
  phase: "timeout" | undefined
): Promise<void> {
  const db = getAdminDb();

  if (phase !== "timeout") {
    // Phase 1 — arm. Stamp `waiting` BEFORE publishing the timeout so the
    // callback can never race an unstamped run; if we die between the two
    // writes, QStash's retry of the arm message re-runs this idempotently.
    const cfg = node.config as unknown as WaitForReplyConfig;
    const seconds = Math.max(60, Math.floor(cfg.seconds ?? 0));
    await runRef.update({
      waiting: {
        nodeId: node.id,
        kind: "reply",
        since: Timestamp.now(),
        until: Timestamp.fromMillis(Date.now() + seconds * 1000),
      },
      status: "waiting",
      currentNodeId: node.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const res = await publishCallback({
      pathname: STEP_PATH,
      body: { runId: run.id, nodeId: node.id, phase: "timeout" },
      delaySeconds: seconds,
      deduplicationId: `wf_${run.id}_${node.id}_timeout`,
    });
    if (!res) {
      await runRef.update({
        waiting: null,
        status: "failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }
    await runRef.update({ qstashMessageId: res.messageId });
    return;
  }

  // Phase 2 — timeout. Claim, then take the No-reply branch.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(runRef);
    if (!snap.exists) return false;
    const r = snap.data() as WorkflowRunDoc;
    if (r.waiting?.nodeId !== node.id) return false; // a reply won the race
    if (r.history.some((h) => h.nodeId === node.id)) return false;
    const entry: WorkflowRunHistoryEntry = {
      nodeId: node.id,
      type: node.type,
      at: Timestamp.now(),
      result: "timeout",
    };
    tx.update(runRef, {
      waiting: null,
      status: "running",
      history: FieldValue.arrayUnion(entry),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return;

  const target = node.branches?.whenFalse ?? null;
  if (!target) {
    await completeRun(runRef, wf.id);
    return;
  }
  await scheduleNode(runRef, target, 0);
}

/**
 * Resolve every run of this contact parked on a `wait_for_reply` node — the
 * contact replied. Called (fire-and-forget) from the unified-inbox upsert for
 * every inbound SMS/WhatsApp/Messenger/Instagram message. Web chat and email
 * deliberately don't count: web chat sessions live outside the inbox, and
 * email replies route to the operator's own inbox and never touch the app.
 *
 * Equality-only query (contactId + status) — no composite index needed.
 * Never throws: a workflow problem must not break the inbound webhook.
 */
export async function resumeWaitingRunsOnReply(input: {
  subAccountId: string;
  contactId: string;
  channel: string;
}): Promise<void> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection("workflowRuns")
      .where("contactId", "==", input.contactId)
      .where("status", "==", "waiting")
      .get();
    if (snap.empty) return;

    for (const doc of snap.docs) {
      const run = doc.data() as WorkflowRunDoc;
      if (run.subAccountId !== input.subAccountId) continue;
      const waiting = run.waiting;
      if (!waiting || waiting.kind !== "reply") continue; // plain timer wait
      const nodeId = waiting.nodeId;

      const claimed = await db.runTransaction(async (tx) => {
        const s = await tx.get(doc.ref);
        if (!s.exists) return false;
        const r = s.data() as WorkflowRunDoc;
        if (r.waiting?.nodeId !== nodeId) return false; // timeout won the race
        if (r.history.some((h) => h.nodeId === nodeId)) return false;
        const entry: WorkflowRunHistoryEntry = {
          nodeId,
          type: "wait_for_reply",
          at: Timestamp.now(),
          result: `replied:${input.channel}`,
        };
        tx.update(doc.ref, {
          waiting: null,
          status: "running",
          history: FieldValue.arrayUnion(entry),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!claimed) continue;

      const wfSnap = await db.doc(`workflows/${run.workflowId}`).get();
      const wf = wfSnap.exists ? (wfSnap.data() as WorkflowDoc) : null;
      const target = wf?.nodes?.[nodeId]?.branches?.whenTrue ?? null;
      if (!target) {
        await completeRun(doc.ref, run.workflowId);
        continue;
      }
      await scheduleNode(doc.ref, target, 0);
    }
  } catch (err) {
    console.warn("[workflows] resumeWaitingRunsOnReply failed", err);
  }
}

/** Manually enroll one contact to dry-run a workflow (ignores trigger/filters;
 *  runs even on a draft via the `test` context flag). */
export async function enrollForTest(opts: {
  subAccountId: string;
  workflowId: string;
  contactId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = getAdminDb();
  const wfSnap = await db.doc(`workflows/${opts.workflowId}`).get();
  if (!wfSnap.exists) return { ok: false, error: "Workflow not found" };
  const wf = { id: wfSnap.id, ...(wfSnap.data() as Omit<WorkflowDoc, "id">) };
  if (wf.subAccountId !== opts.subAccountId) {
    return { ok: false, error: "Workflow not found" };
  }
  if (!wf.startNodeId)
    return { ok: false, error: "Add at least one step first" };
  const cSnap = await db.doc(`contacts/${opts.contactId}`).get();
  if (!cSnap.exists || cSnap.data()!.subAccountId !== opts.subAccountId) {
    return { ok: false, error: "Contact not found" };
  }
  await enroll(wf, opts.contactId, { test: true });
  return { ok: true };
}

async function loadOwner(
  agency: AgencyDoc | null
): Promise<{ displayName: string; email: string }> {
  if (!agency?.ownerUid) return { displayName: "", email: "" };
  try {
    const snap = await getAdminDb().doc(`users/${agency.ownerUid}`).get();
    const d = snap.data();
    return {
      displayName: (d?.displayName as string) ?? "",
      email: (d?.email as string) ?? "",
    };
  } catch {
    return { displayName: "", email: "" };
  }
}
