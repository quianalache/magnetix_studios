import { NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/automations/qstash";
import { emitWorkflowEvent } from "@/lib/workflows/events";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("Upstash-Signature");
  if (!signature || !(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json(
      { error: "Invalid QStash signature" },
      { status: 401 }
    );
  }
  const body = JSON.parse(rawBody) as Record<string, unknown>;
  const required = [
    "subAccountId",
    "agencyId",
    "contactId",
    "deduplicationKey",
  ];
  if (required.some((key) => typeof body[key] !== "string" || !body[key])) {
    return NextResponse.json(
      { error: "Invalid scheduled trigger payload" },
      { status: 400 }
    );
  }
  emitWorkflowEvent({
    eventType: "scheduled.datetime",
    eventId: `scheduled:${body.deduplicationKey as string}`,
    deduplicationKey: body.deduplicationKey as string,
    agencyId: body.agencyId as string,
    subAccountId: body.subAccountId as string,
    contactId: body.contactId as string,
    source: "qstash",
    occurredAt:
      typeof body.scheduledAt === "string" ? body.scheduledAt : undefined,
    payload: { scheduledAt: body.scheduledAt ?? null },
  });
  return NextResponse.json({ ok: true });
}
