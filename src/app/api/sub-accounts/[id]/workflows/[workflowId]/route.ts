import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  deleteWorkflowServerSide,
  getWorkflow,
  updateWorkflowServerSide,
  type WorkflowPatch,
} from "@/lib/server/workflows-service";
import type {
  WorkflowNode,
  WorkflowNodeType,
  WorkflowTrigger,
} from "@/types/workflows";

export const dynamic = "force-dynamic";

const NODE_TYPES: WorkflowNodeType[] = [
  "send_email",
  "send_sms",
  "whatsapp_template",
  "wait",
  "wait_for_reply",
  "if_else",
  "goal",
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
  "grant_community_access",
  "notify_community_member",
  "assign_conversation",
  "close_conversation",
  "reopen_conversation",
  "stop_workflow",
];

const TRIGGER_TYPES = [
  "form.submitted",
  "contact.created",
  "contact.tag.added",
  "contact.tag.removed",
  "contact.updated",
  "pipeline.stage.changed",
  "booking.created",
  "booking.cancelled",
  "booking.rescheduled",
  "booking.completed",
  "booking.no_show",
  "quote.accepted",
  "quote.paid",
  "message.received",
  "task.created",
  "task.completed",
  "deal.created",
  "deal.won",
  "deal.lost",
  "course.enrolled",
  "course.lesson.completed",
  "course.completed",
  "offer.purchase.paid",
  "offer.access.granted",
  "offer.access.revoked",
  "community.member.joined",
  "community.member.approved",
  "workflow.completed",
  "workflow.failed",
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
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "scheduled.datetime",
] as const;

/** Defensive sanitize of a client-supplied nodes map (authed staff, but keep
 *  the shape honest so a malformed save can't poison the engine). */
function sanitizeNodes(raw: unknown): Record<string, WorkflowNode> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, WorkflowNode> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = v as Partial<WorkflowNode>;
    if (!n || typeof n.type !== "string" || !NODE_TYPES.includes(n.type)) {
      return null;
    }
    out[id] = {
      id,
      type: n.type,
      config: (n.config && typeof n.config === "object"
        ? n.config
        : {}) as Record<string, unknown>,
      next: typeof n.next === "string" ? n.next : null,
      branches: n.branches
        ? {
            whenTrue:
              typeof n.branches.whenTrue === "string"
                ? n.branches.whenTrue
                : null,
            whenFalse:
              typeof n.branches.whenFalse === "string"
                ? n.branches.whenFalse
                : null,
          }
        : undefined,
    };
  }
  return out;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const workflow = await getWorkflow(subAccountId, workflowId);
  if (!workflow)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ workflow });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: WorkflowPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (
    body.status === "draft" ||
    body.status === "active" ||
    body.status === "paused"
  ) {
    patch.status = body.status;
  }
  if (body.trigger === null) {
    patch.trigger = null;
  } else if (body.trigger && typeof body.trigger === "object") {
    const trigger = body.trigger as Record<string, unknown>;
    if (
      typeof trigger.type !== "string" ||
      !TRIGGER_TYPES.includes(trigger.type as (typeof TRIGGER_TYPES)[number])
    ) {
      return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });
    }
    patch.trigger = {
      type: trigger.type as WorkflowTrigger["type"],
      filters:
        trigger.filters && typeof trigger.filters === "object"
          ? (trigger.filters as WorkflowTrigger["filters"])
          : { all: [] },
      ...(typeof trigger.formId === "string" || trigger.formId === null
        ? { formId: trigger.formId }
        : {}),
      ...(typeof trigger.toStage === "string" || trigger.toStage === null
        ? { toStage: trigger.toStage }
        : {}),
      ...(typeof trigger.channel === "string" || trigger.channel === null
        ? { channel: trigger.channel }
        : {}),
      ...Object.fromEntries(
        [
          "ownerUid",
          "projectId",
          "pipelineId",
          "stageId",
          "courseId",
          "lessonId",
          "offerId",
          "groupId",
          "assignedToUid",
        ]
          .filter(
            (key) => typeof trigger[key] === "string" || trigger[key] === null
          )
          .map((key) => [key, trigger[key]])
      ),
    };
  }
  if (
    body.reentry === "every_time" ||
    body.reentry === "unless_active" ||
    body.reentry === "once_ever"
  ) {
    patch.reentry = body.reentry;
  }
  if (body.startNodeId === null || typeof body.startNodeId === "string") {
    patch.startNodeId = body.startNodeId as string | null;
  }
  if (body.nodes !== undefined) {
    const nodes = sanitizeNodes(body.nodes);
    if (nodes === null) {
      return NextResponse.json({ error: "Invalid nodes" }, { status: 400 });
    }
    patch.nodes = nodes;
  }

  const ok = await updateWorkflowServerSide({
    subAccountId,
    workflowId,
    patch,
  });
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> }
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const ok = await deleteWorkflowServerSide(subAccountId, workflowId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
