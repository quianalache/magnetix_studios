"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Lock,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_STAGES_PER_PIPELINE,
  STAGE_NAME_MAX,
  activeStages,
  type Pipeline,
  type PipelineStageDef,
} from "@/types/pipelines";
import {
  fetchPipelines,
  PipelineApiError,
  reassignStageApi,
  replaceStagesApi,
} from "@/lib/pipelines/client";

/**
 * Manage Stages (Multiple Pipelines, 2026-09-25) — add, rename, reorder,
 * archive and restore one pipeline's stages. Stages are never deleted.
 * Won and Lost are the standard outcomes: renamable and reorderable, not
 * archivable. A stage that still holds deals must have them moved first —
 * this dialog offers the move (to another stage of this pipeline or of
 * another pipeline) inline, using the same event-firing reassignment the
 * server exposes, so no deal is ever silently dropped.
 */

interface DraftStage {
  id?: string;
  /** Local key for React lists (new stages have no id yet). */
  key: string;
  name: string;
  type: PipelineStageDef["type"];
  archived: boolean;
}

interface PendingReassignment {
  stageKey: string;
  stageId: string;
  count: number;
  toPipelineId: string;
  toStageId: string;
}

let keySeq = 0;
const nextKey = () => `new-${++keySeq}`;

export function ManageStagesDialog({
  subAccountId,
  pipeline,
  open,
  onOpenChange,
  stageCounts,
  onSaved,
}: {
  subAccountId: string;
  pipeline: Pipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deals per stage (unfiltered). */
  stageCounts: Record<string, number>;
  onSaved: (pipeline: Pipeline) => void;
}) {
  const [draft, setDraft] = useState<DraftStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reassigning, setReassigning] = useState<DraftStage | null>(null);
  const [pendingReassignments, setPendingReassignments] = useState<
    PendingReassignment[]
  >([]);

  useEffect(() => {
    if (!open) return;
    setDraft(
      pipeline.stages.map((s) => ({
        id: s.id,
        key: s.id,
        name: s.name,
        type: s.type,
        archived: s.archived,
      }))
    );
    setCounts(stageCounts);
    setPendingReassignments([]);
  }, [open, pipeline, stageCounts]);

  const active = draft.filter((s) => !s.archived);
  const archived = draft.filter((s) => s.archived);

  function update(key: string, patch: Partial<DraftStage>) {
    setDraft((d) => d.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function move(key: string, dir: -1 | 1) {
    setDraft((d) => {
      const act = d.filter((s) => !s.archived);
      const i = act.findIndex((s) => s.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= act.length) return d;
      [act[i], act[j]] = [act[j], act[i]];
      return [...act, ...d.filter((s) => s.archived)];
    });
  }

  function archive(stage: DraftStage) {
    if (stage.id && (counts[stage.id] ?? 0) > 0) {
      setReassigning(stage);
      return;
    }
    if (!stage.id) {
      // Never saved — just drop it.
      setDraft((d) => d.filter((s) => s.key !== stage.key));
      return;
    }
    update(stage.key, { archived: true });
  }

  async function save() {
    if (active.filter((s) => s.type === "open").length === 0) {
      toast.error("Keep at least one active stage.");
      return;
    }
    if (draft.some((s) => !s.name.trim())) {
      toast.error("Every stage needs a name.");
      return;
    }
    setSaving(true);
    try {
      // Keep reassignment inside the Save transaction from the user's point
      // of view. Opening the helper or choosing a destination only edits the
      // local draft; Cancel never calls the live move endpoint.
      for (const pending of pendingReassignments) {
        let remaining = pending.count;
        for (let guard = 0; guard < 100 && remaining > 0; guard++) {
          const res = await reassignStageApi(
            subAccountId,
            pipeline.id,
            pending.stageId,
            {
              toPipelineId: pending.toPipelineId,
              toStageId: pending.toStageId,
            }
          );
          remaining = res.remaining;
          if (res.moved === 0) break;
        }
        if (remaining > 0) {
          throw new PipelineApiError(
            "Could not move all deals out of the stage.",
            409,
            "stage_reassignment_incomplete"
          );
        }
      }
      const res = await replaceStagesApi(
        subAccountId,
        pipeline.id,
        [...active, ...archived].map((s) => ({
          ...(s.id ? { id: s.id } : {}),
          name: s.name.trim(),
          archived: s.archived,
        }))
      );
      toast.success("Stages saved");
      onSaved(res.pipeline);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof PipelineApiError ? err.message : "Couldn't save stages."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage stages</DialogTitle>
            <DialogDescription>
              {pipeline.name} · Rename, reorder, add or archive stages. Archived
              stages keep their history; deals must be moved out before a stage
              can be archived.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-2">
            {active.map((s, i) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
                  {i + 1}
                </span>
                <Input
                  value={s.name}
                  maxLength={STAGE_NAME_MAX}
                  aria-label={`Stage ${i + 1} name`}
                  onChange={(e) => update(s.key, { name: e.target.value })}
                />
                <span
                  className="text-muted-foreground w-10 shrink-0 text-center text-xs tabular-nums"
                  title="Deals in this stage"
                >
                  {s.id ? (counts[s.id] ?? 0) : "new"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(s.key, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Move down"
                  disabled={i === active.length - 1}
                  onClick={() => move(s.key, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {s.type === "open" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive ${s.name}`}
                    onClick={() => archive(s)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                ) : (
                  <span
                    className="text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center"
                    title="Won and Lost are standard outcomes and can't be archived"
                  >
                    <Lock className="h-4 w-4" />
                  </span>
                )}
              </li>
            ))}
          </ol>

          <Button
            variant="outline"
            size="sm"
            disabled={draft.length >= MAX_STAGES_PER_PIPELINE}
            onClick={() => {
              // New stages go before the first outcome stage by default.
              setDraft((d) => {
                const act = d.filter((s) => !s.archived);
                const firstOutcome = act.findIndex((s) => s.type !== "open");
                const at = firstOutcome === -1 ? act.length : firstOutcome;
                const added: DraftStage = {
                  key: nextKey(),
                  name: "",
                  type: "open",
                  archived: false,
                };
                return [
                  ...act.slice(0, at),
                  added,
                  ...act.slice(at),
                  ...d.filter((s) => s.archived),
                ];
              });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add stage
          </Button>

          {archived.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <p className="text-muted-foreground text-xs font-medium">
                Archived
              </p>
              {archived.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground truncate">
                    {s.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update(s.key, { archived: false })}
                  >
                    <ArchiveRestore className="mr-1 h-4 w-4" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save stages"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReassignDialog
        subAccountId={subAccountId}
        pipeline={pipeline}
        stage={reassigning}
        count={reassigning?.id ? (counts[reassigning.id] ?? 0) : 0}
        onClose={() => setReassigning(null)}
        onDone={(stage, destination) => {
          // The reassign dialog is a draft editor. Do not move deals until
          // the parent Save button is pressed.
          setPendingReassignments((current) => [
            ...current.filter((p) => p.stageKey !== stage.key),
            {
              stageKey: stage.key,
              stageId: stage.id!,
              count: counts[stage.id!] ?? 0,
              ...destination,
            },
          ]);
          setCounts((c) => ({ ...c, [stage.id!]: 0 }));
          update(stage.key, { archived: true });
          setReassigning(null);
        }}
      />
    </>
  );
}

function ReassignDialog({
  subAccountId,
  pipeline,
  stage,
  count,
  onClose,
  onDone,
}: {
  subAccountId: string;
  pipeline: Pipeline;
  stage: DraftStage | null;
  count: number;
  onClose: () => void;
  onDone: (
    stage: DraftStage,
    destination: { toPipelineId: string; toStageId: string }
  ) => void;
}) {
  const [pipelines, setPipelines] = useState<Pipeline[] | null>(null);
  const [target, setTarget] = useState("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!stage) return;
    setTarget("");
    fetchPipelines(subAccountId)
      .then((r) => setPipelines(r.pipelines))
      .catch(() => setPipelines([pipeline]));
  }, [stage, subAccountId, pipeline]);

  const options = useMemo(() => {
    const list = pipelines ?? [pipeline];
    return list.map((p) => ({
      pipeline: p,
      stages: activeStages(p).filter(
        (s) => !(p.id === pipeline.id && s.id === stage?.id)
      ),
    }));
  }, [pipelines, pipeline, stage]);

  async function run() {
    if (!stage?.id || !target) return;
    const [toPipelineId, toStageId] = target.split("::");
    setMoving(true);
    try {
      toast.success(
        `Reassignment staged for ${count} ${count === 1 ? "deal" : "deals"}. Save to apply it.`
      );
      onDone(stage, { toPipelineId, toStageId });
    } catch (err) {
      toast.error(
        err instanceof PipelineApiError
          ? err.message
          : "Couldn't move the deals."
      );
    } finally {
      setMoving(false);
    }
  }

  return (
    <Dialog open={!!stage} onOpenChange={(o) => !o && !moving && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move deals before archiving</DialogTitle>
          <DialogDescription>
            &ldquo;{stage?.name}&rdquo; has {count}{" "}
            {count === 1 ? "deal" : "deals"}. Choose where they should go. Each
            move is recorded on the deal and fires your automations like any
            other stage change.
          </DialogDescription>
        </DialogHeader>
        <select
          aria-label="Destination stage"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="border-input [&_option]:bg-background [&_option]:text-foreground h-10 w-full rounded-lg border bg-transparent px-2.5 text-sm"
        >
          <option value="">Choose a destination stage…</option>
          {options.map(({ pipeline: p, stages }) => (
            <optgroup key={p.id} label={p.name}>
              {stages.map((s) => (
                <option key={s.id} value={`${p.id}::${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button
            onClick={run}
            disabled={!target || moving}
            className={cn(moving && "cursor-wait")}
          >
            {moving
              ? "Moving…"
              : `Move ${count} ${count === 1 ? "deal" : "deals"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
