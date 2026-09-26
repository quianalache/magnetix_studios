import "server-only";

import { NextResponse } from "next/server";
import { PipelineError } from "@/lib/server/pipelines-service";

/** Run a pipeline-service call, mapping {@link PipelineError} to its HTTP status. */
export async function withPipelineErrors(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PipelineError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      );
    }
    throw err;
  }
}

/** Parse a JSON body; null when it isn't an object. */
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const INVALID_JSON = () =>
  NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
