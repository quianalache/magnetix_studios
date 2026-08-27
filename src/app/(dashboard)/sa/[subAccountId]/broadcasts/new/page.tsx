"use client";

import { BroadcastComposer } from "@/components/broadcasts/broadcast-composer";

/**
 * Persistent Broadcast Drafts V1 (2026-08-27) — this page is now a thin
 * wrapper around the shared composer. No draft exists yet when this route
 * loads; the composer creates one itself, autosaved, once there's real
 * content (see broadcast-composer.tsx's "creation boundary" comment).
 */
export default function NewBroadcastPage() {
  return <BroadcastComposer />;
}
