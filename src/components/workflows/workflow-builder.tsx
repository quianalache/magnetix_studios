"use client";

import { createContext, useContext, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Bell,
  CheckSquare,
  Clock,
  Flag,
  GitBranch,
  Info,
  KanbanSquare,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  PencilLine,
  Plus,
  Reply,
  Tag,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkflowStatusBadge } from "./workflow-status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PIPELINE_STAGES } from "@/types/deals";
import {
  ADDABLE_TYPES,
  NODE_LABELS,
  NODE_REQUIREMENT,
  TRIGGER_LABELS,
  defaultConfig,
  nodeSummary,
  type NodeRequirement,
} from "@/lib/workflows/catalog";
import { cn } from "@/lib/utils";
import {
  flattenTree,
  isBranchingType,
  newNodeId,
  parseTree,
  type BuilderStep,
} from "@/lib/workflows/builder-tree";
import { ConditionsEditor } from "./conditions-editor";
import {
  NodeConfigDialog,
  type WhatsappTemplateOption,
} from "./node-config-dialog";
import { TestDialog } from "./test-dialog";
import type {
  WorkflowNodeType,
  WorkflowReentry,
  WorkflowStatus,
  WorkflowTrigger,
  WorkflowTriggerType,
} from "@/types/workflows";

const TRIGGER_TYPES: WorkflowTriggerType[] = [
  "form.submitted",
  "contact.created",
  "contact.tag.added",
  "pipeline.stage.changed",
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
  "quote.accepted",
  "quote.paid",
  "message.received",
  "contact.updated",
  "contact.tag.removed",
  "task.created",
  "task.completed",
  "deal.created",
  "deal.won",
  "deal.lost",
  "booking.completed",
  "booking.no_show",
  "course.enrolled",
  "course.lesson.completed",
  "course.completed",
  "offer.purchase.paid",
  "offer.access.granted",
  "offer.access.revoked",
  "community.member.joined",
  "community.member.approved",
  "contact.field.changed",
  "contact.source.changed",
  "deal.amount.changed",
  "deal.updated",
  "payment.succeeded",
  "payment.failed",
  "subscription.created",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.paused",
  "refund.issued",
  "community.member.left",
  "community.post.created",
  "community.comment.created",
  "community.event.started",
  "community.event.ended",
  "community.live.ended",
  "community.replay.ready",
  "message.sent",
  "conversation.assigned",
  "conversation.closed",
  "conversation.reopened",
  // Deferred until Resend webhook signing is configured and runtime-tested.
  "scheduled.datetime",
  "workflow.completed",
  "workflow.failed",
];

const MESSAGE_CHANNELS: { value: string; label: string }[] = [
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Facebook Messenger" },
  { value: "instagram", label: "Instagram" },
];

function triggerCategory(type: WorkflowTriggerType): string {
  if (type.startsWith("contact.")) return "Contacts & CRM";
  if (type.startsWith("task.")) return "Tasks";
  if (type.startsWith("deal.") || type.startsWith("pipeline."))
    return "Pipelines & Deals";
  if (type.startsWith("booking.")) return "Bookings";
  if (
    type.startsWith("payment.") ||
    type.startsWith("subscription.") ||
    type === "refund.issued"
  )
    return "Payments & Subscriptions";
  if (type.startsWith("course.") || type.startsWith("offer."))
    return "Courses & Offers";
  if (type.startsWith("community.")) return "Community";
  if (
    type.startsWith("conversation.") ||
    type === "message.sent" ||
    type === "message.received"
  )
    return "Conversations";
  if (type.startsWith("email.")) return "Email";
  if (type.startsWith("workflow.")) return "Workflows";
  if (type.startsWith("scheduled.")) return "Date & Time";
  return "Forms & Quotes";
}

function actionCategory(type: WorkflowNodeType): string {
  if (
    type.startsWith("send_") ||
    type === "whatsapp_template" ||
    type === "notify"
  )
    return "Messaging";
  if (type.includes("contact")) return "Contacts & CRM";
  if (type.includes("task")) return "Tasks";
  if (type.includes("deal") || type === "move_stage")
    return "Pipelines & Deals";
  if (type.includes("course") || type.includes("offer"))
    return "Courses & Offers";
  if (type.includes("community")) return "Community";
  if (type.includes("conversation")) return "Conversations";
  if (type.includes("workflow")) return "Workflow Control";
  if (type === "wait" || type === "wait_for_reply" || type === "if_else")
    return "Logic & Timing";
  return "Utilities";
}

const ICONS: Record<WorkflowNodeType, typeof Mail> = {
  send_email: Mail,
  send_sms: MessageSquare,
  whatsapp_template: MessageCircle,
  wait: Clock,
  wait_for_reply: Reply,
  if_else: GitBranch,
  goal: Flag,
  add_tag: Tag,
  remove_tag: Tag,
  move_stage: KanbanSquare,
  update_field: PencilLine,
  create_task: CheckSquare,
  notify: Bell,
  webhook: Webhook,
  create_contact: PencilLine,
  update_task: CheckSquare,
  complete_task: CheckSquare,
  create_deal: KanbanSquare,
  update_deal: KanbanSquare,
  grant_offer_access: Zap,
  enroll_course: Zap,
  start_workflow: Zap,
  revoke_offer_access: Zap,
  remove_course_access: Zap,
  grant_community_access: Zap,
  notify_community_member: Bell,
  assign_conversation: MessageSquare,
  close_conversation: MessageSquare,
  reopen_conversation: MessageSquare,
  stop_workflow: Zap,
};

export interface BuilderInitial {
  id: string;
  name: string;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  reentry?: WorkflowReentry;
  nodes: Record<string, import("@/types/workflows").WorkflowNode>;
  startNodeId: string | null;
}

const REENTRY_OPTIONS: { value: WorkflowReentry; label: string }[] = [
  { value: "every_time", label: "Every time the trigger fires" },
  { value: "unless_active", label: "Not while already in this workflow" },
  { value: "once_ever", label: "Only once per contact, ever" },
];

/**
 * Per-tier breakdown of each send-integration check, surfaced on the node as
 * small green/red indicators so operators can see WHICH half of the validation
 * passed (e.g. SMS: dedicated sub-account number vs shared agency env).
 */
export interface ReadinessDetail {
  /** SMS via the sub-account's own dedicated Twilio. */
  smsSub: boolean;
  /** SMS via the shared deployment (agency) Twilio env vars. */
  smsAgency: boolean;
  /** Email From the sub-account's own verified sending domain. */
  emailSub: boolean;
  /** Email via the shared deployment (agency) Resend sender. */
  emailAgency: boolean;
  /** WhatsApp agency gate on. */
  whatsappGate: boolean;
  /** WhatsApp sender configured on the sub-account. */
  whatsappSender: boolean;
  /** At least one Meta-approved WhatsApp template. */
  whatsappTemplate: boolean;
}

/** Which send-integrations can actually run, so doomed steps get flagged. */
export interface BuilderReadiness {
  emailReady: boolean;
  smsReady: boolean;
  whatsappReady: boolean;
  detail: ReadinessDetail;
}

export type { WhatsappTemplateOption };

// Provided once at the top of the builder so the recursive step chain can read
// it without prop-drilling through Chain/Branch.
const ReadinessContext = createContext<BuilderReadiness>({
  emailReady: true,
  smsReady: true,
  whatsappReady: true,
  detail: {
    smsSub: false,
    smsAgency: false,
    emailSub: false,
    emailAgency: false,
    whatsappGate: false,
    whatsappSender: false,
    whatsappTemplate: false,
  },
});

export function WorkflowBuilder({
  saId,
  initial,
  forms,
  readiness,
  whatsappTemplates,
}: {
  saId: string;
  initial: BuilderInitial;
  forms: { id: string; name: string }[];
  readiness: BuilderReadiness;
  whatsappTemplates: WhatsappTemplateOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<WorkflowStatus>(initial.status);
  const [trigger, setTrigger] = useState<WorkflowTrigger>(initial.trigger);
  const [reentry, setReentry] = useState<WorkflowReentry>(
    initial.reentry ?? "every_time"
  );
  const [steps, setSteps] = useState<BuilderStep[]>(
    parseTree(initial.nodes, initial.startNodeId)
  );
  const [editing, setEditing] = useState<BuilderStep | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [triggerQuery, setTriggerQuery] = useState("");

  /** Recursively replace a step's config by id. */
  function saveConfig(id: string, config: Record<string, unknown>) {
    const walk = (list: BuilderStep[]): BuilderStep[] =>
      list.map((s) => {
        if (s.id === id) return { ...s, config };
        if (isBranchingType(s.type)) {
          return {
            ...s,
            whenTrue: walk(s.whenTrue ?? []),
            whenFalse: walk(s.whenFalse ?? []),
          };
        }
        return s;
      });
    setSteps((cur) => walk(cur));
  }

  async function persist(nextStatus?: WorkflowStatus) {
    const effective = nextStatus ?? status;
    if (effective === "active" && steps.length === 0) {
      toast.error("Add at least one step before activating.");
      return;
    }
    setSaving(true);
    try {
      const { nodes, startNodeId } = flattenTree(steps);
      const res = await fetch(
        `/api/sub-accounts/${saId}/workflows/${initial.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            status: effective,
            trigger,
            reentry,
            nodes,
            startNodeId,
          }),
        }
      );
      if (!res.ok) throw new Error();
      setStatus(effective);
      toast.success("Workflow saved");
      router.refresh();
    } catch {
      toast.error("Couldn't save workflow");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ReadinessContext.Provider value={readiness}>
      <div className="mx-auto max-w-2xl space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={`/sa/${saId}/workflows`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Workflows
          </Link>
          <div className="flex items-center gap-2">
            <WorkflowStatusBadge status={status} />
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link href={`/sa/${saId}/workflows/${initial.id}/runs`} />
              }
            >
              Runs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTesting(true)}
            >
              Test
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => persist(status === "active" ? "paused" : "active")}
            >
              {status === "active" ? "Pause" : "Activate"}
            </Button>
            <Button size="sm" disabled={saving} onClick={() => persist()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 text-lg font-semibold"
          placeholder="Workflow name"
        />

        {/* Trigger */}
        <div className="bg-card rounded-xl border p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-amber-500" /> When this happens
          </div>
          <select
            value={trigger.type}
            onChange={(e) =>
              setTrigger({
                type: e.target.value as WorkflowTriggerType,
                filters: trigger.filters ?? { all: [] },
              })
            }
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            {Array.from(new Set(TRIGGER_TYPES.map(triggerCategory))).map(
              (group) => {
                const options = TRIGGER_TYPES.filter(
                  (t) =>
                    triggerCategory(t) === group &&
                    TRIGGER_LABELS[t]
                      .toLowerCase()
                      .includes(triggerQuery.toLowerCase())
                );
                return options.length ? (
                  <optgroup key={group} label={group}>
                    {options.map((t) => (
                      <option key={t} value={t}>
                        {TRIGGER_LABELS[t]}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              }
            )}
          </select>
          <Input
            value={triggerQuery}
            onChange={(e) => setTriggerQuery(e.target.value)}
            className="mt-2"
            placeholder="Search triggers…"
            aria-label="Search workflow triggers"
          />

          {trigger.type === "form.submitted" && (
            <select
              value={trigger.formId ?? ""}
              onChange={(e) =>
                setTrigger({ ...trigger, formId: e.target.value || null })
              }
              className="border-input bg-background mt-2 h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">Any form</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}

          {trigger.type === "pipeline.stage.changed" && (
            <select
              value={trigger.toStage ?? ""}
              onChange={(e) =>
                setTrigger({ ...trigger, toStage: e.target.value || null })
              }
              className="border-input bg-background mt-2 h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">Any stage</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  Moved to {s.label}
                </option>
              ))}
            </select>
          )}

          {trigger.type === "message.received" && (
            <>
              <select
                value={trigger.channel ?? ""}
                onChange={(e) =>
                  setTrigger({ ...trigger, channel: e.target.value || null })
                }
                className="border-input bg-background mt-2 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Any channel</option>
                {MESSAGE_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Fires on every inbound message. Set re-entry to &ldquo;Not while
                already in this workflow&rdquo; below so a chatty contact
                isn&apos;t enrolled once per message.
              </p>
            </>
          )}

          {(
            [
              "task.created",
              "task.completed",
              "deal.created",
              "deal.won",
              "deal.lost",
              "booking.completed",
              "booking.no_show",
              "course.enrolled",
              "course.lesson.completed",
              "course.completed",
              "offer.purchase.paid",
              "offer.access.granted",
              "offer.access.revoked",
              "community.member.joined",
              "community.member.approved",
              "community.member.left",
              "community.post.created",
              "community.comment.created",
              "community.event.started",
              "community.event.ended",
              "community.live.ended",
              "community.replay.ready",
            ] as WorkflowTriggerType[]
          ).includes(trigger.type) && (
            <Input
              className="mt-2"
              placeholder={
                trigger.type.startsWith("course.")
                  ? "Optional course ID"
                  : trigger.type.startsWith("offer.")
                    ? "Optional offer ID"
                    : trigger.type.startsWith("community.")
                      ? "Optional Community/group ID"
                      : trigger.type.startsWith("deal.")
                        ? "Optional stage ID"
                        : "Optional entity ID"
              }
              value={
                trigger.courseId ??
                trigger.offerId ??
                trigger.groupId ??
                trigger.stageId ??
                ""
              }
              onChange={(e) => {
                const value = e.target.value || null;
                if (trigger.type.startsWith("course."))
                  setTrigger({ ...trigger, courseId: value });
                else if (trigger.type.startsWith("offer."))
                  setTrigger({ ...trigger, offerId: value });
                else if (trigger.type.startsWith("community."))
                  setTrigger({ ...trigger, groupId: value });
                else if (trigger.type.startsWith("deal."))
                  setTrigger({ ...trigger, stageId: value });
              }}
            />
          )}

          <div className="mt-3 border-t pt-3">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">
              Only continue if (optional)
            </div>
            <ConditionsEditor
              value={trigger.filters ?? { all: [] }}
              onChange={(g) => setTrigger({ ...trigger, filters: g })}
            />
          </div>

          <div className="mt-3 border-t pt-3">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">
              Re-enroll this contact
            </div>
            <select
              value={reentry}
              onChange={(e) => setReentry(e.target.value as WorkflowReentry)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
            >
              {REENTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step chain */}
        <Chain steps={steps} onChange={setSteps} onEdit={setEditing} />

        <NodeConfigDialog
          step={editing}
          whatsappTemplates={whatsappTemplates}
          onClose={() => setEditing(null)}
          onSave={(config) => editing && saveConfig(editing.id, config)}
        />
        <TestDialog
          saId={saId}
          workflowId={initial.id}
          open={testing}
          onOpenChange={setTesting}
        />
      </div>
    </ReadinessContext.Provider>
  );
}

/* ----------------------------- Chain renderer -------------------------- */

function Chain({
  steps,
  onChange,
  onEdit,
}: {
  steps: BuilderStep[];
  onChange: (s: BuilderStep[]) => void;
  onEdit: (s: BuilderStep) => void;
}) {
  const endsInBranch =
    steps.length > 0 && isBranchingType(steps[steps.length - 1].type);

  function add(type: WorkflowNodeType) {
    const step: BuilderStep = {
      id: newNodeId(),
      type,
      config: defaultConfig(type),
    };
    if (isBranchingType(type)) {
      step.whenTrue = [];
      step.whenFalse = [];
    }
    onChange([...steps, step]);
    if (type !== "goal") onEdit(step);
  }

  return (
    <div className="space-y-0">
      {steps.map((s, i) => (
        <div key={s.id}>
          <Connector />
          <StepCard
            step={s}
            onEdit={() => onEdit(s)}
            onDelete={() => onChange(steps.filter((_, j) => j !== i))}
          />
          {isBranchingType(s.type) && (
            <div className="mt-1 ml-4 grid grid-cols-2 gap-3 border-l-2 border-dashed pl-3">
              <Branch
                label={s.type === "wait_for_reply" ? "Replied" : "Yes"}
                steps={s.whenTrue ?? []}
                onChange={(ns) =>
                  onChange(
                    steps.map((x, j) => (j === i ? { ...x, whenTrue: ns } : x))
                  )
                }
                onEdit={onEdit}
              />
              <Branch
                label={s.type === "wait_for_reply" ? "No reply" : "No"}
                steps={s.whenFalse ?? []}
                onChange={(ns) =>
                  onChange(
                    steps.map((x, j) => (j === i ? { ...x, whenFalse: ns } : x))
                  )
                }
                onEdit={onEdit}
              />
            </div>
          )}
        </div>
      ))}

      {!endsInBranch && (
        <>
          <Connector />
          <AddMenu onAdd={add} />
        </>
      )}
    </div>
  );
}

function Branch({
  label,
  steps,
  onChange,
  onEdit,
}: {
  label: string;
  steps: BuilderStep[];
  onChange: (s: BuilderStep[]) => void;
  onEdit: (s: BuilderStep) => void;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-xs font-semibold uppercase">
        {label}
      </div>
      <Chain steps={steps} onChange={onChange} onEdit={onEdit} />
    </div>
  );
}

function Connector() {
  return <div className="bg-border mx-auto h-4 w-px" />;
}

const REQUIREMENT_WARNING: Record<string, string> = {
  email:
    "Email isn't configured on this deployment, so this step will be skipped when the workflow runs. Add RESEND_API_KEY + EMAIL_FROM to fix it.",
  sms: "SMS can't run for this sub-account, so this step will be skipped. Give this sub-account a dedicated Twilio number in Settings → SMS, or have your agency enable the shared SMS sender. (See the sub/agency indicators below.)",
  whatsapp:
    "WhatsApp isn't ready for this sub-account, so this step will be skipped. It needs all three: your agency to enable WhatsApp, a WhatsApp sender configured in Settings → SMS, and at least one Meta-approved template.",
};

/**
 * Compact availability badges on a step. Shows ONLY the senders this step can
 * actually use right now (green tiers): `SA` = this sub-account's own dedicated
 * sender, `A` = the shared agency sender. Nothing renders when neither is
 * available (the red border + warning already flags that).
 */
function ReadinessChips({
  requirement,
  detail,
}: {
  requirement: NodeRequirement;
  detail: ReadinessDetail;
}) {
  const badges: { code: "SA" | "A"; title: string }[] = [];

  if (requirement === "sms") {
    if (detail.smsSub)
      badges.push({
        code: "SA",
        title:
          "Sub-account sender — this sub-account's own dedicated Twilio number is configured; SMS sends from it.",
      });
    if (detail.smsAgency)
      badges.push({
        code: "A",
        title:
          "Agency sender — the shared, deployment-wide Twilio sender is available to this sub-account.",
      });
  } else if (requirement === "email") {
    if (detail.emailSub)
      badges.push({
        code: "SA",
        title:
          "Sub-account sender — this sub-account's own verified sending domain is active; email sends from it.",
      });
    if (detail.emailAgency)
      badges.push({
        code: "A",
        title:
          "Agency sender — the shared, deployment-wide email sender is available to this sub-account.",
      });
  } else if (
    detail.whatsappGate &&
    detail.whatsappSender &&
    detail.whatsappTemplate
  ) {
    // WhatsApp is dedicated-only — there's no shared/agency tier.
    badges.push({
      code: "SA",
      title:
        "Sub-account sender — WhatsApp is enabled, a sender is configured, and at least one approved template exists.",
    });
  }

  if (badges.length === 0) return null;

  return (
    <div className="mt-1 flex items-center gap-1">
      {badges.map((b) => (
        <span
          key={b.code}
          title={b.title}
          className="inline-flex h-4 min-w-4 cursor-help items-center justify-center rounded bg-emerald-500/10 px-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
        >
          {b.code}
        </span>
      ))}
    </div>
  );
}

function StepCard({
  step,
  onEdit,
  onDelete,
}: {
  step: BuilderStep;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const readiness = useContext(ReadinessContext);
  const requirement = NODE_REQUIREMENT[step.type];
  const unmet =
    requirement === "email"
      ? !readiness.emailReady
      : requirement === "sms"
        ? !readiness.smsReady
        : requirement === "whatsapp"
          ? !readiness.whatsappReady
          : false;
  const warning = unmet ? REQUIREMENT_WARNING[requirement!] : null;

  const Icon = ICONS[step.type];
  return (
    <div
      className={cn(
        "bg-card flex items-center gap-3 rounded-lg border p-3 shadow-sm",
        unmet && "border-red-500/60"
      )}
    >
      <div
        className={cn(
          "bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          unmet && "bg-red-500/10 text-red-600 dark:text-red-400"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span>{NODE_LABELS[step.type]}</span>
          {warning && (
            <span
              title={warning}
              className="inline-flex cursor-help text-red-600 dark:text-red-400"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <div
          className={cn(
            "truncate text-xs",
            unmet
              ? "text-red-600/80 dark:text-red-400/80"
              : "text-muted-foreground"
          )}
        >
          {unmet ? "Won't run — integration not configured" : nodeSummary(step)}
        </div>
        {requirement && (
          <ReadinessChips requirement={requirement} detail={readiness.detail} />
        )}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AddMenu({ onAdd }: { onAdd: (t: WorkflowNodeType) => void }) {
  const [query, setQuery] = useState("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="bg-card text-muted-foreground hover:text-foreground mx-auto flex h-8 w-8 items-center justify-center rounded-full border shadow-sm" />
        }
      >
        <Plus className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="max-h-80 w-56 overflow-y-auto"
      >
        <div className="p-2" onKeyDown={(e) => e.stopPropagation()}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            aria-label="Search workflow actions"
          />
        </div>
        {Array.from(new Set(ADDABLE_TYPES.map(actionCategory))).map((group) => {
          const options = ADDABLE_TYPES.filter(
            (t) =>
              actionCategory(t) === group &&
              NODE_LABELS[t].toLowerCase().includes(query.toLowerCase())
          );
          if (!options.length) return null;
          return (
            <div key={group}>
              <div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
                {group}
              </div>
              {options.map((t) => {
                const Icon = ICONS[t];
                return (
                  <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
                    <Icon className="mr-2 h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{NODE_LABELS[t]}</span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
