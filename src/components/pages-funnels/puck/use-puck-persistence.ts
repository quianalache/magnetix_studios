"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import type { PopupDefinitionMap } from "@/types/pages-funnels-popup";

export type PuckSaveState = "idle" | "saving" | "saved" | "error";
export type PuckSaveKind = "manual" | "auto";
type PostResult = { ok: true } | { ok: false; error: string; conflict: boolean };

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
 * - Draft revision (Page Version History, 2026-11-17): every save and
 *   publish sends the draft revision this editor last saw. When the page's
 *   draft has moved on elsewhere (another tab, another admin, a restored
 *   version) the server refuses with a conflict instead of overwriting it;
 *   autosave then stops and the editor asks for a reload. This is conflict
 *   DETECTION, not collaborative editing.
 * - Save Draft sends `kind: "manual"` (a Version History checkpoint);
 *   autosave sends `kind: "auto"`.
 */
export function usePuckPersistence({
  subAccountId,
  pageId,
  data,
  popups,
  enabled,
  initialRevision = 0,
}: {
  subAccountId: string;
  pageId: string;
  data: Data;
  popups: PopupDefinitionMap;
  /** False until the editor has finished its own initial mount — guards
   *  "no save before initial page load completes" even before the natural
   *  same-value comparison below would already prevent it. */
  enabled: boolean;
  /** The page's `puckDraftRevision` when the editor opened (0 when absent). */
  initialRevision?: number;
}) {
  const [saveState, setSaveState] = useState<PuckSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const latestDataRef = useRef(data);
  const latestPopupsRef = useRef(popups);
  const lastSavedSerializedRef = useRef<string>(JSON.stringify({ data, popups }));
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  // A manual Save Draft that arrives while another save is in flight must
  // still be recorded as manual when it runs.
  const pendingKindRef = useRef<PuckSaveKind>("auto");
  const revisionRef = useRef(initialRevision);
  const [conflict, setConflict] = useState(false);
  const conflictRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Revert draft to published (Wave 3): while the server replaces the draft,
  // no autosave may write the old draft back over it.
  const suspendedRef = useRef(false);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);
  useEffect(() => {
    latestPopupsRef.current = popups;
  }, [popups]);

  const draftEndpoint = `/api/sub-accounts/${subAccountId}/pages-funnels/${pageId}/puck-draft`;
  const publishEndpoint = `/api/sub-accounts/${subAccountId}/pages-funnels/${pageId}/puck-publish`;

  /** One draft write, with the revision check. Never runs two at once (callers guard). */
  const postDraft = useCallback(async (kind: PuckSaveKind): Promise<PostResult> => {
    const payload = latestDataRef.current;
    const currentPopups = latestPopupsRef.current;
    try {
      const res = await fetch(draftEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload, popups: currentPopups, kind, baseRevision: revisionRef.current }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string; revision?: number };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? "Failed to save draft.", conflict: res.status === 409 && json.code === "conflict" };
      }
      if (typeof json.revision === "number") revisionRef.current = json.revision;
      lastSavedSerializedRef.current = JSON.stringify({ data: payload, popups: currentPopups });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to save draft.", conflict: false };
    }
  }, [draftEndpoint]);

  /** Another tab / person / restore changed the draft: stop autosaving. */
  const enterConflict = useCallback((message: string) => {
    suspendedRef.current = true;
    pendingRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    conflictRef.current = true;
    setConflict(true);
    setSaveState("error");
    setSaveError(message);
  }, []);

  const runSave = useCallback(async (kind: PuckSaveKind = "auto") => {
    if (suspendedRef.current) return;
    if (savingRef.current) {
      pendingRef.current = true;
      if (kind === "manual") pendingKindRef.current = "manual";
      return;
    }
    savingRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    const result = await postDraft(kind);
    if (result.ok) setSaveState("saved");
    else if (result.conflict) enterConflict(result.error);
    else {
      setSaveState("error");
      setSaveError(result.error);
    }
    savingRef.current = false;
    if (pendingRef.current && !suspendedRef.current) {
      pendingRef.current = false;
      const nextKind = pendingKindRef.current;
      pendingKindRef.current = "auto";
      runSave(nextKind);
    }
  }, [postDraft, enterConflict]);

  // Debounced autosave — fires only when `data` has genuinely changed since
  // the last successful save (or since mount, if nothing has saved yet).
  useEffect(() => {
    if (!enabled || suspendedRef.current) return;
    const serialized = JSON.stringify({ data, popups });
    if (serialized === lastSavedSerializedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSave("auto");
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [data, popups, enabled, runSave]);

  /** Explicit flush — cancels any pending debounce timer and saves now. */
  const saveDraft = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    return runSave("manual");
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
    const currentPopups = latestPopupsRef.current;
    try {
      const res = await fetch(publishEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload, popups: currentPopups, baseRevision: revisionRef.current }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        revision?: number;
      };
      if (!res.ok || !json.ok) {
        if (res.status === 409 && json.code === "conflict") enterConflict(json.error ?? "This page was changed somewhere else. Reload to get the latest draft.");
        throw new Error(json.error ?? "Failed to publish.");
      }
      if (typeof json.revision === "number") revisionRef.current = json.revision;
      // Publish durably saves the draft too (same payload, one atomic
      // write server-side) — reflect that in the Save Draft state as well
      // so the two controls don't disagree right after a Publish.
      lastSavedSerializedRef.current = JSON.stringify({ data: payload, popups: currentPopups });
      setSaveState("saved");
      setPublishState("saved");
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to publish.";
      setPublishState("error");
      setPublishError(message);
      return { ok: false, error: message };
    }
  }, [publishEndpoint, enterConflict]);

  /**
   * Stops autosave and waits for an in-flight save to finish. Used before an
   * action that replaces the stored draft on the server (Revert); call
   * `resume()` if that action fails.
   */
  const suspend = useCallback(async () => {
    suspendedRef.current = true;
    pendingRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    for (let i = 0; i < 100 && savingRef.current; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }, []);
  const resume = useCallback(() => {
    if (conflictRef.current) return;
    suspendedRef.current = false;
  }, []);

  /** True when the editor holds edits the server hasn't saved yet. */
  const hasUnsavedChanges = useCallback(
    () => JSON.stringify({ data: latestDataRef.current, popups: latestPopupsRef.current }) !== lastSavedSerializedRef.current,
    []
  );
  /** The draft revision this editor last saw (sent with a restore). */
  const getRevision = useCallback(() => revisionRef.current, []);

  /**
   * Before Restore (Version History): stop autosave, wait for any in-flight
   * save, then save edits not saved yet — so the server's "Before restore"
   * version includes them. On failure autosave resumes and the error is
   * returned; nothing is restored.
   */
  const flushAndSuspend = useCallback(async (): Promise<PostResult> => {
    await suspend();
    if (conflictRef.current) return { ok: false, error: "This page was changed somewhere else. Reload to get the latest draft first.", conflict: true };
    if (!hasUnsavedChanges()) return { ok: true };
    setSaveState("saving");
    const result = await postDraft("auto");
    if (result.ok) {
      setSaveState("saved");
      return result;
    }
    if (result.conflict) enterConflict(result.error);
    else {
      setSaveState("error");
      setSaveError(result.error);
      suspendedRef.current = false;
    }
    return result;
  }, [suspend, hasUnsavedChanges, postDraft, enterConflict]);

  return {
    suspend,
    resume,
    flushAndSuspend,
    hasUnsavedChanges,
    getRevision,
    conflict,
    saveState,
    saveError,
    saveDraft,
    publishState,
    publishError,
    publish,
  };
}
