"use client";

import { use, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import Link from "next/link";
import { PageShell } from "@/components/system/page-shell";
import { Button } from "@/components/ui/button";
import { RoutineDetailSheet } from "@/components/routines/routine-detail-sheet";
import { RoutineEditorDialog } from "@/components/routines/routine-editor-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteRoutineApi } from "@/lib/client/routines-api";
import { toast } from "sonner";
import type { RoutineView } from "@/types/routines";
import { routineCalendarDate } from "@/lib/calendar/navigation";

/** Full-page Routine Workspace. The detail implementation is shared with the
 * legacy deep-link sheet, but is rendered inline so browser navigation and
 * the workspace hierarchy match Projects. */
export default function RoutineWorkspacePage({
  params,
}: {
  params: Promise<{ routineId: string }>;
}) {
  const { routineId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { saPath, subAccountId } = useSubAccount();
  const [editing, setEditing] = useState<RoutineView | null>(null);
  const [deleting, setDeleting] = useState<RoutineView | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailKey, setDetailKey] = useState(0);
  const initialDate = routineCalendarDate(searchParams.get("date"));

  return (
    <PageShell width="wide" className="gap-5">
      <Link
        href={saPath("/projects/routines")}
        className="inline-flex w-fit items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to Routines
      </Link>
      <RoutineDetailSheet
        key={detailKey}
        routineId={routineId}
        initialDate={initialDate}
        open
        onOpenChange={(open) => {
          if (!open) router.push(saPath("/projects/routines"));
        }}
        onEdit={(routine) => setEditing(routine)}
        onDelete={(routine) => setDeleting(routine)}
        onChanged={() => setDetailKey((key) => key + 1)}
      />
      {editing && (
        <RoutineEditorDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          routine={editing}
          projects={[]}
          onSaved={() => {
            setEditing(null);
            setDetailKey((key) => key + 1);
          }}
        />
      )}
      {deleting && (
        <Dialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete “{deleting.name}”?</DialogTitle>
              <DialogDescription>
                This stops future recurrence and removes unfinished upcoming occurrences. Completed and historical activity records, subtasks and tracked time remain available as history. Retaining recurring activities as standalone tasks is not supported by the current occurrence model, so no ambiguous conversion is performed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteBusy}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={deleteBusy}
                onClick={async () => {
                  setDeleteBusy(true);
                  try {
                    await deleteRoutineApi(subAccountId, deleting.id);
                    toast.success("Routine deleted; history preserved");
                    router.push(saPath("/projects/routines"));
                  } catch (err) {
                    toast.error((err as Error).message);
                  } finally {
                    setDeleteBusy(false);
                    setDeleting(null);
                  }
                }}
              >{deleteBusy ? "Deleting…" : "Delete routine"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
