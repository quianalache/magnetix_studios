"use client";

import { useEffect, useState } from "react";
import { useSubAccount } from "@/context/sub-account-context";

/** Team member names for assignee display/filters (via the task-assignees route). */
export function useTaskAssignees() {
  const { subAccountId } = useSubAccount();
  const [assignees, setAssignees] = useState<{ uid: string; name: string }[]>([]);
  const [viewerUid, setViewerUid] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/task-assignees`)
      .then((r) => (r.ok ? r.json() : { assignees: [], viewerUid: null }))
      .then((d: { assignees: { uid: string; name: string }[]; viewerUid: string | null }) => {
        if (cancelled) return;
        setAssignees(d.assignees ?? []);
        setViewerUid(d.viewerUid ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);
  return { assignees, viewerUid };
}
