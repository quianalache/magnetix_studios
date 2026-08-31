import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  getChannelByName,
  getInaccessibleChannelNames,
} from "@/lib/server/community-channels-service";
import {
  createCommunityEventServerSide,
  listCommunityEventsServerSide,
  updateCommunityEventLifecycleServerSide,
} from "@/lib/server/community-event-service";
import { validateCommunityEventSchedule } from "@/lib/community/event-scheduling";

export const dynamic = "force-dynamic";

function serializeEvent(
  event: Awaited<ReturnType<typeof listCommunityEventsServerSide>>[number]
) {
  const millis = (value: unknown) => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    return typeof v?.toMillis === "function"
      ? v.toMillis()
      : v?.seconds
        ? v.seconds * 1000
        : null;
  };
  return {
    ...event,
    startAt: millis(event.startAt),
    endAt: millis(event.endAt),
    createdAt: null,
    updatedAt: null,
  };
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  const events = await listCommunityEventsServerSide(saId, groupId);
  const inaccessible = await getInaccessibleChannelNames({
    subAccountId: saId,
    groupId,
    isModerator: access.membership.role === "moderator",
  });
  return NextResponse.json({
    events: events
      .filter(
        (event) =>
          access.membership.role === "moderator" ||
          !event.channel ||
          !inaccessible.has(event.channel)
      )
      .map(serializeEvent),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const timezone =
    typeof body.timezone === "string" ? body.timezone.trim() : "";
  const schedule = validateCommunityEventSchedule({
    startAt: typeof body.startAt === "string" ? body.startAt : "",
    endAt: typeof body.endAt === "string" ? body.endAt : "",
    timezone,
  });
  const locationType =
    body.locationType === "external" || body.locationType === "none"
      ? body.locationType
      : "magnetix_live";
  if (!title)
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!timezone || !schedule.ok)
    return NextResponse.json(
      { error: schedule.ok ? "Choose a valid timezone." : schedule.error },
      { status: 400 }
    );
  const channel =
    typeof body.channel === "string" ? body.channel.trim() || null : null;
  if (channel && !(await getChannelByName(saId, groupId, channel)))
    return NextResponse.json(
      { error: "Selected channel was not found" },
      { status: 400 }
    );
  try {
    const event = await createCommunityEventServerSide({
      subAccountId: saId,
      agencyId: access.group.agencyId,
      groupId,
      createdByMemberId: access.member.id,
      title,
      description:
        typeof body.description === "string" ? body.description : null,
      startAt: schedule.startAt,
      endAt: schedule.endAt,
      timezone,
      channel,
      accentColor:
        typeof body.accentColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(body.accentColor)
          ? body.accentColor
          : null,
      thumbnailUrl:
        typeof body.thumbnailUrl === "string" ? body.thumbnailUrl : null,
      hideAttendees: body.hideAttendees === true,
      reminderEnabled: body.reminderEnabled === true,
      locationType,
      externalUrl:
        typeof body.externalUrl === "string" ? body.externalUrl : null,
      liveMode: body.liveMode === "broadcast" ? "broadcast" : "meeting",
    });
    return NextResponse.json({ event: serializeEvent(event) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create event",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok" || access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: access.kind === "ok" ? 403 : access.status }
    );
  let body: { eventId?: string; status?: "live" | "ended" | "canceled" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.eventId || !body.status)
    return NextResponse.json(
      { error: "Event and status are required" },
      { status: 400 }
    );
  const event = await updateCommunityEventLifecycleServerSide(
    saId,
    groupId,
    body.eventId,
    body.status
  );
  return event
    ? NextResponse.json({ event: serializeEvent(event) })
    : NextResponse.json({ error: "Event not found" }, { status: 404 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind !== "ok" || access.membership.role !== "moderator")
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: access.kind === "ok" ? 403 : access.status }
    );
  const eventId = new URL(request.url).searchParams.get("roomId");
  if (!eventId)
    return NextResponse.json({ error: "Event is required" }, { status: 400 });
  const event = await updateCommunityEventLifecycleServerSide(
    saId,
    groupId,
    eventId,
    "ended"
  );
  return event
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Event not found" }, { status: 404 });
}
