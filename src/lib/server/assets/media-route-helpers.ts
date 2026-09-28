import "server-only";

import { NextResponse } from "next/server";
import { MediaLibraryError } from "@/lib/server/assets/media-library-service";
import { MediaShareError } from "@/lib/server/assets/media-share-service";

export function mediaErrorResponse(err: unknown): NextResponse {
  if (err instanceof MediaLibraryError || err instanceof MediaShareError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[media-library] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}
