"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PIPELINE_DESCRIPTION_MAX,
  PIPELINE_NAME_MAX,
  STAGE_NAME_MAX,
  type Pipeline,
} from "@/types/pipelines";
import {
  createPipelineApi,
  PipelineApiError,
  updatePipelineApi,
} from "@/lib/pipelines/client";

/**
 * Create a pipeline (name, description, its own open stages — Won and Lost
 * are added automatically) or edit an existing pipeline's name/description.
 * Stage changes on an existing pipeline live in Manage Stages.
 */
export function PipelineFormDialog({
  subAccountId,
  open,
  onOpenChange,
  pipeline,
  onSaved,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create */
  pipeline: Pipeline | null;
  onSaved: (pipeline: Pipeline) => void;
}) {
  const editing = !!pipeline;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stageNames, setStageNames] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(pipeline?.name ?? "");
    setDescription(pipeline?.description ?? "");
    setStageNames([""]);
  }, [open, pipeline]);

  const cleanStages = stageNames.map((s) => s.trim()).filter(Boolean);

  function moveStage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stageNames.length) return;
    const next = [...stageNames];
    [next[i], next[j]] = [next[j], next[i]];
    setStageNames(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give the pipeline a name.");
      return;
    }
    if (!editing && cleanStages.length === 0) {
      toast.error("Add at least one stage.");
      return;
    }
    setSaving(true);
    try {
      const res = editing
        ? await updatePipelineApi(subAccountId, pipeline!.id, {
            name: name.trim(),
            description: description.trim() || null,
          })
        : await createPipelineApi(subAccountId, {
            name: name.trim(),
            description: description.trim(),
            stageNames: cleanStages,
          });
      toast.success(editing ? "Pipeline updated" : "Pipeline created");
      onSaved(res.pipeline);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit pipeline" : "Create pipeline"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Rename this pipeline or change its description. Stages are managed from the pipeline board."
                : "Each pipeline has its own stages. Won and Lost are added automatically as the standard outcomes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="pipeline-name">Name</Label>
            <Input
              id="pipeline-name"
              value={name}
              maxLength={PIPELINE_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pipeline-description">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="pipeline-description"
              value={description}
              maxLength={PIPELINE_DESCRIPTION_MAX}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {!editing && (
            <div className="space-y-2">
              <Label>Stages</Label>
              <ol className="space-y-2">
                {stageNames.map((s, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <Input
                      value={s}
                      maxLength={STAGE_NAME_MAX}
                      placeholder="Stage name"
                      aria-label={`Stage ${i + 1} name`}
                      onChange={(e) => {
                        const next = [...stageNames];
                        next[i] = e.target.value;
                        setStageNames(next);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move stage up"
                      disabled={i === 0}
                      onClick={() => moveStage(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Move stage down"
                      disabled={i === stageNames.length - 1}
                      onClick={() => moveStage(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove stage"
                      disabled={stageNames.length === 1}
                      onClick={() => setStageNames(stageNames.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStageNames([...stageNames, ""])}
              >
                <Plus className="mr-1 h-4 w-4" /> Add stage
              </Button>
              <p className="text-xs text-muted-foreground">
                Followed by <strong>Won</strong> and <strong>Lost</strong>.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Create pipeline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
