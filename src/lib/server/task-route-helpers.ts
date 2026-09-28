import "server-only";

import { NextResponse } from "next/server";
import { TaskInputError } from "@/lib/server/project-tasks-service";

/** Uniform error mapping for the task / time / milestone routes. */
export function taskErrorResponse(err: unknown): NextResponse {
  if (err instanceof TaskInputError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[tasks] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

export async function readJson(
  request: Request
): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await request.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
