import "server-only";

import { NextResponse } from "next/server";
import { ContentSetError } from "@/lib/server/content-set-service";

/** Maps service errors to their status; anything unexpected is a logged 500 with no internals leaked. */
export function contentSetErrorResponse(err: unknown): NextResponse {
  if (err instanceof ContentSetError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[content-sets] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

/** Entry ids contain ":" — tolerate both encoded and decoded path segments. */
export function decodeParam(value: string): string {
  try {
    return value.includes("%") ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}
