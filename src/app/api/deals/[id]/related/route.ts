import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDealRoute } from "@/lib/server/deal-route-guard";
import { toEpochMs } from "@/lib/segmentation/eval-condition-group";

export const dynamic = "force-dynamic";

/**
 * GET /api/deals/:id/related — the tasks and appointments linked to this
 * deal (Deal Details → Next Steps / Upcoming Appointment). Reads the
 * existing Tasks + Calendar records by `dealId`; nothing is duplicated.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const guard = await requireDealRoute(request, id);
  if (guard instanceof NextResponse) return guard;
  const db = getAdminDb();
  const sa = guard.deal.subAccountId;
  const [taskSnap, eventSnap] = await Promise.all([
    db.collection("tasks").where("subAccountId", "==", sa).where("dealId", "==", id).limit(200).get(),
    db.collection("events").where("subAccountId", "==", sa).where("dealId", "==", id).limit(200).get(),
  ]);
  const iso = (v: unknown) => {
    const ms = toEpochMs(v);
    return ms === null ? null : new Date(ms).toISOString();
  };
  const tasks = taskSnap.docs
    .map((d) => ({
      id: d.id,
      title: String(d.get("title") ?? ""),
      notes: String(d.get("notes") ?? ""),
      dueAt: iso(d.get("dueAt")),
      completed: d.get("completed") === true,
      completedAt: iso(d.get("completedAt")),
      contactId: (d.get("contactId") as string | null) ?? null,
    }))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.completed) return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
      return (b.completedAt ?? "").localeCompare(a.completedAt ?? "");
    });
  const now = Date.now();
  const appointments = eventSnap.docs
    .map((d) => ({
      id: d.id,
      title: String(d.get("title") ?? ""),
      startAt: iso(d.get("startAt")),
      endAt: iso(d.get("endAt")),
      status: String(d.get("status") ?? "scheduled"),
      location: String(d.get("location") ?? ""),
      meetingUrl: (d.get("meetingUrl") as string | null) ?? null,
    }))
    .filter((e) => e.startAt)
    .sort((a, b) => a.startAt!.localeCompare(b.startAt!));
  const upcoming = appointments.filter(
    (e) => Date.parse(e.startAt!) >= now && !["cancelled", "completed", "no_show"].includes(e.status),
  );
  return NextResponse.json({ tasks, appointments, upcoming });
}
