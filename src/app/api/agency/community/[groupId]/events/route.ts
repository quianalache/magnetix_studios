import { NextResponse } from "next/server";
import { resolveAgencyCommunityCaller } from "@/lib/server/agency-community-access";
import {
  getAgencyChannelByName,
  getAgencyInaccessibleChannelNames,
} from "@/lib/server/community-agency-service";
import {
  createAgencyEventServerSide,
  listAgencyEventsServerSide,
  updateAgencyEventLifecycleServerSide,
} from "@/lib/server/agency-community-event-service";
import { validateCommunityEventSchedule } from "@/lib/community/event-scheduling";

export const dynamic = "force-dynamic";

function serializeEvent(event: Awaited<ReturnType<typeof listAgencyEventsServerSide>>[number]) {
  const millis = (value: unknown) => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    return typeof v?.toMillis === "function" ? v.toMillis() : v?.seconds ? v.seconds * 1000 : null;
  };
  return { ...event, startAt: millis(event.startAt), endAt: millis(event.endAt), createdAt: null, updatedAt: null };
}

/** Agency Community Events — list. Owner OR an active member. */
export async function GET(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  const isModerator = caller.kind === "owner";

  const events = await listAgencyEventsServerSide(caller.agencyId, groupId);
  const inaccessible = await getAgencyInaccessibleChannelNames({
    agencyId: caller.agencyId,
    groupId,
    isModerator,
  });
  return NextResponse.json({
    events: events
      .filter((event) => isModerator || !event.channel || !inaccessible.has(event.channel))
      .map(serializeEvent),
  });
}

/** Create an event. Owner-only (creating is a moderation action). */
export async function POST(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  const schedule = validateCommunityEventSchedule({
    startAt: typeof body.startAt === "string" ? body.startAt : "",
    endAt: typeof body.endAt === "string" ? body.endAt : "",
    timezone,
  });
  const locationType =
    body.locationType === "external" || body.locationType === "none" ? body.locationType : "magnetix_live";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!timezone || !schedule.ok) {
    return NextResponse.json({ error: schedule.ok ? "Choose a valid timezone." : schedule.error }, { status: 400 });
  }
  const channel = typeof body.channel === "string" ? body.channel.trim() || null : null;
  if (channel && !(await getAgencyChannelByName(caller.agencyId, groupId, channel))) {
    return NextResponse.json({ error: "Selected channel was not found" }, { status: 400 });
  }
  try {
    const event = await createAgencyEventServerSide({
      agencyId: caller.agencyId,
      groupId,
      createdById: caller.uid,
      title,
      description: typeof body.description === "string" ? body.description : null,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      timezone,
      channel,
      accentColor:
        typeof body.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(body.accentColor)
          ? body.accentColor
          : null,
      thumbnailUrl: typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
      hideAttendees: body.hideAttendees === true,
      reminderEnabled: body.reminderEnabled === true,
      locationType,
      externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : null,
      liveMode: body.liveMode === "broadcast" ? "broadcast" : "meeting",
    });
    return NextResponse.json({ event: serializeEvent(event) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create event" },
      { status: 400 },
    );
  }
}

/** Update event lifecycle status. Owner-only. */
export async function PATCH(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  let body: { eventId?: string; status?: "live" | "ended" | "canceled" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.eventId || !body.status) {
    return NextResponse.json({ error: "Event and status are required" }, { status: 400 });
  }
  const event = await updateAgencyEventLifecycleServerSide(caller.agencyId, groupId, body.eventId, body.status);
  return event ? NextResponse.json({ event: serializeEvent(event) }) : NextResponse.json({ error: "Event not found" }, { status: 404 });
}

/** Ends (not deletes) an event. Owner-only. */
export async function DELETE(request: Request, ctx: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await ctx.params;
  const caller = await resolveAgencyCommunityCaller(request, groupId);
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }
  const eventId = new URL(request.url).searchParams.get("roomId");
  if (!eventId) return NextResponse.json({ error: "Event is required" }, { status: 400 });
  const event = await updateAgencyEventLifecycleServerSide(caller.agencyId, groupId, eventId, "ended");
  return event ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Event not found" }, { status: 404 });
}
