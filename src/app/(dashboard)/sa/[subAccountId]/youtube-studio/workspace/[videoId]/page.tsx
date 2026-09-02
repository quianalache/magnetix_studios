"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { InputStep } from "@/components/ytcs/input-step";
import { DeepDiveStep } from "@/components/ytcs/deep-dive-step";
import { ScriptPromptBuilderStep } from "@/components/ytcs/script-prompt-builder-step";
import { CreateVideoStep } from "@/components/ytcs/create-video-step";
import { TitlesStep } from "@/components/ytcs/titles-step";
import { PublishStep } from "@/components/ytcs/publish-step";
import { YTCS_STARTING_POINTS, YTCS_STEPS, type YtcsStartingPointType, type YtcsVideoProject } from "@/types/ytcs";
import type { BusinessBrain } from "@/types/business-brain";

const BUILT_STEPS = new Set([
  "Input",
  "Deep Dive",
  "Script Prompt Builder",
  "Create Video",
  "Titles",
  "Publish",
]);

/**
 * Video Workspace project detail — the 6-step pipeline shell (migration
 * spec §6/§9-§13). All six steps are now built: Input/Deep Dive/Script
 * Prompt Builder (Phase 1+2), Create Video (Phase 3A), Titles/Publish
 * (Phase 3B).
 */
export default function VideoProjectPage() {
  const { subAccountId, saPath } = useSubAccount();
  const params = useParams<{ videoId: string }>();
  const router = useRouter();
  const videoId = params.videoId;

  const [project, setProject] = useState<YtcsVideoProject | null>(null);
  const [businessBrain, setBusinessBrain] = useState<BusinessBrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [changingStartingPoint, setChangingStartingPoint] = useState(false);
  // Which step TAB is being viewed right now — separate from the
  // project's own persisted `currentStep` (pipeline progress). A real
  // migrated project sitting at "Deep Dive" or later must still let its
  // Input step be opened and edited via the Input tab; conflating "tab
  // being viewed" with "project's persisted step" would hide that
  // project's Input data behind the "coming in a later phase" stub for
  // every one of the 14 real projects not currently on Input.
  const [viewingStep, setViewingStep] = useState<string>("Input");

  async function load() {
    setLoading(true);
    try {
      const [videoRes, brainRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${videoId}`),
        fetch(`/api/sub-accounts/${subAccountId}/business-brain`),
      ]);
      if (videoRes.status === 404) {
        setNotFound(true);
        return;
      }
      const videoData = await videoRes.json();
      const brainData = await brainRes.json().catch(() => ({}));
      setProject(videoData.project ?? null);
      setBusinessBrain(brainData.brain ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!subAccountId || !videoId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId, videoId]);

  async function saveProject(updates: Partial<YtcsVideoProject>) {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/ytcs/videos/${videoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save");
    setProject(data.project);
  }

  async function generateTitlePrompt() {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/ytcs/videos/${videoId}/generate-title-prompt`,
      { method: "POST" },
    );
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't generate the title prompt");
    setProject(data.project);
  }

  async function markPublished() {
    await saveProject({
      status: "Published",
      publishDate: project?.publishDate || new Date().toISOString().slice(0, 10),
    });
  }

  async function changeStartingPoint(next: YtcsStartingPointType) {
    try {
      await saveProject({ startingPointType: next });
      setChangingStartingPoint(false);
      toast.success("Starting point changed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change starting point");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading project…
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">This project couldn&apos;t be found.</p>
        <Button variant="outline" onClick={() => router.push(saPath("/youtube-studio/workspace"))}>
          <ArrowLeft className="h-4 w-4" /> Back to Video Workspace
        </Button>
      </div>
    );
  }

  const persistedStep = project.currentStep || "Input";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(saPath("/youtube-studio/workspace"))}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold">{project.name || "Untitled Video Project"}</h2>
          <p className="text-xs text-muted-foreground">Currently at: {persistedStep}</p>
        </div>
        <span />
      </div>

      <div className="flex flex-wrap gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">
        {YTCS_STEPS.map((step) => {
          const isBuilt = BUILT_STEPS.has(step);
          const isActive = viewingStep === step;
          return (
            <button
              key={step}
              type="button"
              disabled={!isBuilt}
              onClick={() => isBuilt && setViewingStep(step)}
              title={isBuilt ? step : `${step} — coming in a later phase`}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-background shadow-sm"
                  : isBuilt
                    ? "text-muted-foreground hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/50"
              }`}
            >
              {!isBuilt && <Lock className="h-3 w-3" />}
              {step}
            </button>
          );
        })}
      </div>

      {changingStartingPoint ? (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="text-sm font-semibold">Change Starting Point</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Your existing input, deep dive, and other saved data are kept — only the
            starting point changes.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {YTCS_STARTING_POINTS.map((sp) => (
              <button
                key={sp.value}
                type="button"
                onClick={() => changeStartingPoint(sp.value)}
                className={`rounded-xl border p-3 text-left text-sm transition-colors ${
                  project.startingPointType === sp.value ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setChangingStartingPoint(false)}>
            Cancel
          </Button>
        </div>
      ) : viewingStep === "Input" ? (
        <InputStep
          subAccountId={subAccountId}
          project={project}
          businessBrain={businessBrain}
          onSave={saveProject}
          onChangeStartingPoint={() => setChangingStartingPoint(true)}
        />
      ) : viewingStep === "Deep Dive" ? (
        <DeepDiveStep
          subAccountId={subAccountId}
          project={project}
          onSave={saveProject}
          onContinue={() => setViewingStep("Script Prompt Builder")}
        />
      ) : viewingStep === "Script Prompt Builder" ? (
        <ScriptPromptBuilderStep
          subAccountId={subAccountId}
          project={project}
          businessBrain={businessBrain}
          onSave={saveProject}
        />
      ) : viewingStep === "Create Video" ? (
        <CreateVideoStep project={project} onSave={saveProject} />
      ) : viewingStep === "Titles" ? (
        <TitlesStep
          project={project}
          onSave={saveProject}
          onGenerate={generateTitlePrompt}
          onContinue={() => setViewingStep("Publish")}
        />
      ) : viewingStep === "Publish" ? (
        <PublishStep project={project} onSave={saveProject} onMarkPublished={markPublished} />
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">{viewingStep} is coming in a later phase</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This project&apos;s data for this step is preserved from the original migration
            and hasn&apos;t been lost — the editor for it just isn&apos;t built yet.
          </p>
        </div>
      )}
    </div>
  );
}
