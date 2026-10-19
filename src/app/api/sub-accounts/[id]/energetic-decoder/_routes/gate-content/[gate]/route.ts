import "server-only";

import { NextResponse } from "next/server";

/**
 * Retired editing route (Public Reading Tool, 2026-10-19). Interpretive text
 * is edited in one place — Energetic Decoder → Content (Content Sets), whose
 * Default set writes the very same stored text this route used to. No UI
 * called this route any more; it now refuses writes so there are no
 * competing editing paths. The read endpoint beside it is unchanged.
 */
function retired() {
  return NextResponse.json(
    { error: "This editor has moved. Edit interpretive text in Energetic Decoder → Content." },
    { status: 410 },
  );
}

export async function POST() {
  return retired();
}

export async function DELETE() {
  return retired();
}
