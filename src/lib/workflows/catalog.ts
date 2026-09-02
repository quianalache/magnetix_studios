import type { BuilderStep } from "@/lib/workflows/builder-tree";
import type {
  ConditionOp,
  WorkflowNodeType,
  WorkflowTriggerType,
} from "@/types/workflows";

export const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  "form.submitted": "Form submitted",
  "contact.created": "Contact created",
  "contact.tag.added": "Tag added to contact",
  "pipeline.stage.changed": "Pipeline stage changed",
  "booking.created": "Booking created",
  "booking.cancelled": "Booking cancelled",
  "booking.rescheduled": "Booking rescheduled",
  "quote.accepted": "Quote accepted",
  "quote.paid": "Quote/invoice paid",
  "message.received": "Message received (inbox)",
  "contact.updated": "Contact updated",
  "contact.tag.removed": "Tag removed from contact",
  "task.created": "Task created",
  "task.completed": "Task completed",
  "deal.created": "Deal created",
  "deal.won": "Deal won",
  "deal.lost": "Deal lost",
  "booking.completed": "Booking completed",
  "booking.no_show": "Booking no-show",
  "course.enrolled": "Course enrolled",
  "course.lesson.completed": "Lesson completed",
  "course.completed": "Course completed",
  "offer.purchase.paid": "Offer purchased",
  "offer.access.granted": "Offer access granted",
  "offer.access.revoked": "Offer access revoked",
  "community.member.joined": "Community member joined",
  "community.member.approved": "Community member approved",
  "workflow.completed": "Workflow completed",
  "workflow.failed": "Workflow failed",
};

export const NODE_LABELS: Record<WorkflowNodeType, string> = {
  send_email: "Send email",
  send_sms: "Send SMS",
  whatsapp_template: "Send WhatsApp",
  wait: "Wait",
  wait_for_reply: "Wait for reply",
  if_else: "If / else",
  goal: "End workflow",
  add_tag: "Add tag",
  remove_tag: "Remove tag",
  move_stage: "Move pipeline stage",
  update_field: "Update field",
  create_task: "Create task",
  notify: "Internal notification",
  webhook: "Webhook",
  create_contact: "Create contact",
  update_task: "Update task",
  complete_task: "Complete task",
  create_deal: "Create deal",
  update_deal: "Update deal",
  grant_offer_access: "Grant Offer access",
  enroll_course: "Enroll in course",
  start_workflow: "Start another workflow",
};

/**
 * Integration a node needs to actually run. The builder flags nodes whose
 * requirement isn't configured (deployment env or, for SMS, a sub-account's
 * dedicated Twilio) so the operator sees a doomed step before activating.
 * Node types not listed have no external dependency.
 */
export type NodeRequirement = "email" | "sms" | "whatsapp";
export const NODE_REQUIREMENT: Partial<
  Record<WorkflowNodeType, NodeRequirement>
> = {
  send_email: "email",
  notify: "email",
  send_sms: "sms",
  whatsapp_template: "whatsapp",
};

/** Step types offerable from the "add step" menu, in display order. */
export const ADDABLE_TYPES: WorkflowNodeType[] = [
  "send_email",
  "send_sms",
  "whatsapp_template",
  "wait",
  "wait_for_reply",
  "add_tag",
  "remove_tag",
  "move_stage",
  "update_field",
  "create_task",
  "notify",
  "webhook",
  "create_contact",
  "update_task",
  "complete_task",
  "create_deal",
  "update_deal",
  "grant_offer_access",
  "enroll_course",
  "start_workflow",
  "if_else",
  "goal",
];

export const CONDITION_OPS: { value: ConditionOp; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "contains", label: "contains" },
  { value: "is_set", label: "is set" },
  { value: "not_set", label: "is empty" },
  { value: "has_tag", label: "has tag" },
  { value: "in_stage", label: "is in stage" },
  { value: "source_is", label: "source is" },
];

export function defaultConfig(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case "send_email":
      return { subject: "", body: "" };
    case "send_sms":
      return { body: "" };
    case "whatsapp_template":
      return { templateId: "", manualValues: {} };
    case "wait":
      return { seconds: 86_400 };
    case "wait_for_reply":
      return { seconds: 2 * 86_400 };
    case "if_else":
      return { conditions: { all: [] } };
    case "add_tag":
    case "remove_tag":
      return { tag: "" };
    case "move_stage":
      return { stage: "new" };
    case "update_field":
      return { field: "", value: "" };
    case "create_task":
      return { title: "", dueInDays: 1 };
    case "notify":
      return { recipient: "owner", to: "", subject: "", body: "" };
    case "webhook":
      return { url: "" };
    case "create_contact":
      return {
        name: "",
        email: "",
        phone: "",
        company: "",
        source: "workflow",
      };
    case "update_task":
      return { taskId: "", title: "", notes: "" };
    case "complete_task":
      return { taskId: "" };
    case "create_deal":
      return {
        title: "",
        value: 0,
        currency: "USD",
        stageId: "new",
        priority: "medium",
      };
    case "update_deal":
      return {
        dealId: "",
        title: "",
        value: 0,
        currency: "USD",
        stageId: "new",
        priority: "medium",
      };
    case "grant_offer_access":
      return { offerId: "", purchaseId: "" };
    case "enroll_course":
      return { courseId: "" };
    case "start_workflow":
      return { workflowId: "" };
    default:
      return {};
  }
}

/** Short human summary shown on a collapsed step card. */
export function nodeSummary(step: BuilderStep): string {
  const c = step.config;
  switch (step.type) {
    case "send_email":
      return (c.subject as string) || "No subject yet";
    case "send_sms":
      return (c.body as string)?.slice(0, 60) || "No message yet";
    case "whatsapp_template":
      return (c.templateId as string)
        ? "WhatsApp template"
        : "Choose a template";
    case "wait": {
      const s = Number(c.seconds ?? 0);
      if (s % 86_400 === 0) return `Wait ${s / 86_400} day(s)`;
      if (s % 3_600 === 0) return `Wait ${s / 3_600} hour(s)`;
      return `Wait ${Math.round(s / 60)} min`;
    }
    case "wait_for_reply": {
      const s = Number(c.seconds ?? 0);
      const win =
        s % 86_400 === 0
          ? `${s / 86_400} day(s)`
          : s % 3_600 === 0
            ? `${s / 3_600} hour(s)`
            : `${Math.round(s / 60)} min`;
      return `Up to ${win}`;
    }
    case "if_else": {
      const n = ((c.conditions as { all?: unknown[] })?.all ?? []).length;
      return n ? `${n} condition(s)` : "No conditions yet";
    }
    case "add_tag":
    case "remove_tag":
      return (c.tag as string) || "No tag yet";
    case "move_stage":
      return `→ ${(c.stage as string) || "?"}`;
    case "update_field":
      return c.field ? `${c.field} = ${c.value ?? ""}` : "No field yet";
    case "create_task":
      return (c.title as string) || "Untitled task";
    case "notify":
      return (c.subject as string) || (c.to as string) || "Notification";
    case "webhook":
      return (c.url as string) || "No URL yet";
    case "create_contact":
      return (c.name as string) || "New contact";
    case "update_task":
    case "complete_task":
      return (c.taskId as string) || "Choose task";
    case "create_deal":
      return (c.title as string) || "New deal";
    case "update_deal":
      return (c.dealId as string) || "Choose deal";
    case "grant_offer_access":
      return (c.offerId as string) || "Choose offer";
    case "enroll_course":
      return (c.courseId as string) || "Choose course";
    case "start_workflow":
      return (c.workflowId as string) || "Choose workflow";
    case "goal":
      return "Ends the workflow here";
    default:
      return "";
  }
}
