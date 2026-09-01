import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 4000;
function text(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_FIELD_LENGTH
    ? value
    : null;
}

/** Temporary, authenticated-only browser exception intake. No persistence. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (
    !checkMemberAuthRateLimit({
      key: `community-client-error:${saId}:${access.member.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    })
  )
    return NextResponse.json({ ok: true });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 12288)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const name = text(body.name);
  const message = text(body.message);
  const pathname = text(body.pathname);
  const userAgent = text(body.userAgent);
  const timestamp = text(body.timestamp);
  const stack = body.stack === undefined ? null : text(body.stack);
  if (
    !name ||
    !message ||
    !pathname ||
    !userAgent ||
    !timestamp ||
    (body.stack !== undefined && !stack)
  )
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  console.error(
    "[community-client-error]",
    JSON.stringify({ name, message, stack, pathname, userAgent, timestamp })
  );
  return NextResponse.json({ ok: true });
}
