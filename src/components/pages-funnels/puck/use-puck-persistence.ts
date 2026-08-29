"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";

export type PuckSaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 2000;

/**
 * Save Draft / autosave / Publish for the new Puck builder (Puck
 * Persistence + Publish Foundation task, master spec §24.12).
 *
 * ONE save code path (`runSave`) backs both the manual Save Draft button
 * and debounced autosave — per the task's explicit instruction not to
 * duplicate save logic between them. Publish is a separate endpoint
 * (`pages-funnels-puck-service.ts`'s `publishPuckPage` writes both the
 * draft AND published fields atomically in one call), but still routes
 * through this same hook so the header's save-state UI reflects it too.
 *
 * Concurrency notes (task §7/§14):
 * - `latestDataRef` always holds the most current `data`, read fresh at
 *   send-time inside `runSave` — a save never sends a stale closure value.
 * - `savingRef` prevents two overlapping network writes; if a new edit
 *   arrives while a save is in flight, `pendingRef` is set instead of
 *   silently dropping it, and `runSave` re-invokes itself once the current
 *   write finishes — so the LATEST edit is always eventually persisted,
 *   never lost to an in-flight guard.
 * - `lastSavedSerializedRef` is compared against the current `data` before
 *   scheduling an autosave tick at all, so autosave never fires for a
 *   render where nothing actually changed since the last successful save
 *   (or since mount, before any save has happened yet).
 * - This hook does not solve multi-tab concurrent editing — see the task
 *   report's "Remaining Gaps" for why that's explicitly out of scope here,
 *   not silently ignored.
 */
export function usePuckPersistence({
  subAccountId,
  pageId,
  data,
  enabled,
}: {
  subAccountId: string;
  pageId: string;
  data: Data;
  /** False until the editor has finished its own initial mount — guards
   *  "no save before initial page load completes" even before the natural
   *  same-value comparison below would already prevent it. */
  enabled: boolean;
}) {
  const [saveState, setSaveState] = useState<PuckSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const latestDataRef = useRef(data);
  const lastSavedSerializedRef = useRef<string>(JSON.stringify(data));
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  const draftEndpoint = `/api/sub-accounts/${subAccountId}/pages-funnels/${pageId}/puck-draft`;
  const publishEndpoint = `/api/sub-accounts/${subAccountId}/pages-funnels/${pageId}/puck-publish`;

  const runSave = useCallback(async () => {
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    const payload = latestDataRef.current;
    try {
      const res = await fetch(draftEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to save draft.");
      }
      lastSavedSerializedRef.current = JSON.stringify(payload);
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setSaveError(
        err instanceof Error ? err.message : "Failed to save draft."
      );
    } finally {
      savingRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        runSave();
      }
    }
  }, [draftEndpoint]);

  // Debounced autosave — fires only when `data` has genuinely changed since
  // the last successful save (or since mount, if nothing has saved yet).
  useEffect(() => {
    if (!enabled) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSavedSerializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSave();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [data, enabled, runSave]);

  /** Explicit flush — cancels any pending debounce timer and saves now. */
  const saveDraft = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return runSave();
  }, [runSave]);

  const [publishState, setPublishState] = useState<PuckSaveState>("idle");
  const [publishError, setPublishError] = useState<string | null>(null);

  /**
   * Returns `{ok, error?}` directly rather than requiring the caller to
   * read `publishError` state after awaiting — that state closure would be
   * stale by the time this promise resolves (captured at call time, not
   * updated until the next render), which would show a toast with the
   * PREVIOUS error (or none) instead of this attempt's actual one.
   */
  const publish = useCallback(async (): Promise<
    { ok: true } | { ok: false; error: string }
  > => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setPublishState("saving");
    setPublishError(null);
    const payload = latestDataRef.current;
    try {
      const res = await fetch(publishEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Failed to publish.");
      }
      // Publish durably saves the draft too (same payload, one atomic
      // write server-side) — reflect that in the Save Draft state as well
      // so the two controls don't disagree right after a Publish.
      lastSavedSerializedRef.current = JSON.stringify(payload);
      setSaveState("saved");
      setPublishState("saved");
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish.";
      setPublishState("error");
      setPublishError(message);
      return { ok: false, error: message };
    }
  }, [publishEndpoint]);

  return {
    saveState,
    saveError,
    saveDraft,
    publishState,
    publishError,
    publish,
  };
}
