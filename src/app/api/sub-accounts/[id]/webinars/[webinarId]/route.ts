import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  getWebinarServerSide,
  listWebinarRegistrantsServerSide,
  updateWebinarLifecycleServerSide,
} from "@/lib/server/webinar-service";

function serialize(value: unknown) {
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  return typeof v?.toMillis === "function"
    ? v.toMillis()
    : v?.seconds
      ? v.seconds * 1000
      : null;
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; webinarId: string }> }
) {
  const { id, webinarId } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const webinar = await getWebinarServerSide(id, webinarId);
  if (!webinar)
    return NextResponse.json({ error: "Webinar not found" }, { status: 404 });
  return NextResponse.json({
    webinar: {
      ...webinar,
      startAt: serialize(webinar.startAt),
      endAt: serialize(webinar.endAt),
      createdAt: null,
      updatedAt: null,
    },
    registrants: await listWebinarRegistrantsServerSide(id, webinarId),
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; webinarId: string }> }
) {
  const { id, webinarId } = await params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  let body: { status?: "live" | "ended" | "canceled" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.status)
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  const webinar = await updateWebinarLifecycleServerSide(
    id,
    webinarId,
    body.status
  );
  return webinar
    ? NextResponse.json({ webinar })
    : NextResponse.json({ error: "Webinar not found" }, { status: 404 });
}
