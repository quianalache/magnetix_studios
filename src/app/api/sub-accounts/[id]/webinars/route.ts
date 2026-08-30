import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createWebinarServerSide,
  listWebinarsServerSide,
} from "@/lib/server/webinar-service";
import { validateWebinarSchedule } from "@/lib/webinar/scheduling";

function serialize(value: unknown) {
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  return typeof v?.toMillis === "function"
    ? v.toMillis()
    : v?.seconds
      ? v.seconds * 1000
      : null;
}
function publicWebinar(
  w: Awaited<ReturnType<typeof listWebinarsServerSide>>[number]
) {
  return {
    ...w,
    startAt: serialize(w.startAt),
    endAt: serialize(w.endAt),
    createdAt: null,
    updatedAt: null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  return NextResponse.json({
    webinars: (await listWebinarsServerSide(id)).map(publicWebinar),
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const timezone =
    typeof body.timezone === "string" && body.timezone ? body.timezone : "UTC";
  const schedule = validateWebinarSchedule({
    startAt: typeof body.startAt === "string" ? body.startAt : "",
    endAt: typeof body.endAt === "string" ? body.endAt : "",
    timezone,
  });
  if (!title)
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!schedule.ok)
    return NextResponse.json({ error: schedule.error }, { status: 400 });
  const sub = await getAdminDb().doc(`subAccounts/${id}`).get();
  const agencyId = sub.data()?.agencyId as string | undefined;
  if (!agencyId)
    return NextResponse.json(
      { error: "Sub-account is not configured." },
      { status: 400 }
    );
  const webinar = await createWebinarServerSide({
    agencyId,
    subAccountId: id,
    hostUid: access.uid,
    title,
    description: typeof body.description === "string" ? body.description : "",
    startAt: schedule.startAt,
    endAt: schedule.endAt,
    timezone,
    webinarType:
      body.webinarType === "hybrid" || body.webinarType === "evergreen"
        ? body.webinarType
        : "live",
  });
  return NextResponse.json(
    { webinar: publicWebinar(webinar) },
    { status: 201 }
  );
}
