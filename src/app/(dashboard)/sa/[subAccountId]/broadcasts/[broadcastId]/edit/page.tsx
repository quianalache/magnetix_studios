"use client";

import { useParams } from "next/navigation";
import { BroadcastComposer } from "@/components/broadcasts/broadcast-composer";

/**
 * Persistent Broadcast Drafts V1 (2026-08-27) — resume an existing draft.
 * The Broadcasts list links a Draft row here; the composer hydrates from
 * the persisted doc on mount and continues autosaving into the SAME
 * record from then on (see broadcast-composer.tsx).
 */
export default function EditBroadcastDraftPage() {
  const params = useParams<{ broadcastId: string }>();
  return <BroadcastComposer existingBroadcastId={params.broadcastId} />;
}
