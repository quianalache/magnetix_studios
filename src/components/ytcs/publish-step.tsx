"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_YOUTUBE_DESCRIPTION,
  FINAL_REVIEW_ITEMS,
  OPTIMIZATION_CHECKLIST_ITEMS,
  UPLOAD_CHECKLIST_ITEMS,
} from "@/lib/ytcs/publish-checklists";
import type { YtcsVideoProject } from "@/types/ytcs";

/**
 * Step 6: Publish. Upload + optimization command center (migration spec
 * §13). Mark as Published advances `status` — the same real field every
 * other step already uses to track pipeline position — to a terminal
 * "Published" value so a future Video Library's Published tab can
 * filter on it directly; no separate published-video collection.
 */
export function PublishStep({
  project,
  onSave,
  onMarkPublished,
}: {
  project: YtcsVideoProject;
  onSave: (updates: Partial<YtcsVideoProject>) => Promise<void>;
  onMarkPublished: () => Promise<void>;
}) {
  const uploadChecklist = project.uploadChecklist ?? {};
  const optimizationChecklist = project.optimizationChecklist ?? {};
  const finalReviewChecklist = project.finalReviewChecklist ?? {};

  const [finalTitle, setFinalTitle] = useState(project.finalTitle ?? "");
  const [youtubeDescription, setYoutubeDescription] = useState(
    project.youtubeDescription ?? DEFAULT_YOUTUBE_DESCRIPTION,
  );
  const [tagsKeywords, setTagsKeywords] = useState(project.tagsKeywords ?? "");
  const [pinnedComment, setPinnedComment] = useState(project.pinnedComment ?? "");
  const [uploadNotes, setUploadNotes] = useState(project.uploadNotes ?? "");
  const [youtubeLink, setYoutubeLink] = useState(project.youtubeLink ?? "");
  const [publishDate, setPublishDate] = useState(project.publishDate ?? "");
  const [savingAssets, setSavingAssets] = useState(false);
  const [copiedDescription, setCopiedDescription] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    setFinalTitle(project.finalTitle ?? "");
    setYoutubeDescription(project.youtubeDescription ?? DEFAULT_YOUTUBE_DESCRIPTION);
    setTagsKeywords(project.tagsKeywords ?? "");
    setPinnedComment(project.pinnedComment ?? "");
    setUploadNotes(project.uploadNotes ?? "");
    setYoutubeLink(project.youtubeLink ?? "");
    setPublishDate(project.publishDate ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const unmappedUpload = Object.keys(uploadChecklist).filter((k) => !UPLOAD_CHECKLIST_ITEMS.includes(k));
  const unmappedOptimization = Object.keys(optimizationChecklist).filter(
    (k) => !OPTIMIZATION_CHECKLIST_ITEMS.includes(k),
  );
  const unmappedFinalReview = Object.keys(finalReviewChecklist).filter((k) => !FINAL_REVIEW_ITEMS.includes(k));

  async function saveAssets() {
    setSavingAssets(true);
    try {
      await onSave({
        finalTitle,
        youtubeDescription,
        tagsKeywords,
        pinnedComment,
        uploadNotes,
        youtubeLink,
        publishDate,
      });
      toast.success("Publish assets saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingAssets(false);
    }
  }

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(youtubeDescription);
      setCopiedDescription(true);
      setTimeout(() => setCopiedDescription(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the text manually.");
    }
  }

  async function toggleItem(
    kind: "uploadChecklist" | "optimizationChecklist" | "finalReviewChecklist",
    item: string,
    checked: boolean,
  ) {
    setSavingItem(`${kind}:${item}`);
    try {
      await onSave({ [kind]: { [item]: checked } } as Partial<YtcsVideoProject>);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSavingItem(null);
    }
  }

  async function markPublished() {
    setMarking(true);
    try {
      await onMarkPublished();
      toast.success("Marked as Published.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't mark as published.");
    } finally {
      setMarking(false);
    }
  }

  const isPublished = project.status === "Published";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Step 6: Publish</h2>
        <p className="text-sm text-muted-foreground">
          Your upload + optimization command center — get everything ready, double
          check it, then mark the video as published.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Publish Assets</h3>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="final-title">Final Title</Label>
          <Input id="final-title" value={finalTitle} onChange={(e) => setFinalTitle(e.target.value)} />
        </div>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="yt-description">YouTube Description</Label>
            <Button type="button" size="sm" variant="outline" onClick={copyDescription}>
              {copiedDescription ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedDescription ? "Copied" : "Copy Description"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Put your primary CTA link first — before helpful links or timestamps.
          </p>
          <Textarea
            id="yt-description"
            value={youtubeDescription}
            onChange={(e) => setYoutubeDescription(e.target.value)}
            rows={10}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="tags-keywords">Tags / Keywords</Label>
          <Input id="tags-keywords" value={tagsKeywords} onChange={(e) => setTagsKeywords(e.target.value)} />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="pinned-comment">Pinned Comment</Label>
          <Textarea
            id="pinned-comment"
            value={pinnedComment}
            onChange={(e) => setPinnedComment(e.target.value)}
            rows={3}
          />
        </div>

        <div className="mt-3 space-y-1.5">
          <Label htmlFor="upload-notes">Upload Notes</Label>
          <Textarea id="upload-notes" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} rows={3} />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="youtube-link">YouTube Link</Label>
            <Input
              id="youtube-link"
              value={youtubeLink}
              onChange={(e) => setYoutubeLink(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="publish-date">Publish Date</Label>
            <Input id="publish-date" type="date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={saveAssets} disabled={savingAssets}>
            {savingAssets ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Publish Assets
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChecklistCard
          title="Upload Checklist"
          items={UPLOAD_CHECKLIST_ITEMS}
          data={uploadChecklist}
          kind="uploadChecklist"
          unmapped={unmappedUpload}
          savingItem={savingItem}
          onToggle={toggleItem}
        />
        <ChecklistCard
          title="Optimization Checklist"
          items={OPTIMIZATION_CHECKLIST_ITEMS}
          data={optimizationChecklist}
          kind="optimizationChecklist"
          unmapped={unmappedOptimization}
          savingItem={savingItem}
          onToggle={toggleItem}
        />
      </div>

      <ChecklistCard
        title="Final Review"
        items={FINAL_REVIEW_ITEMS}
        data={finalReviewChecklist}
        kind="finalReviewChecklist"
        unmapped={unmappedFinalReview}
        savingItem={savingItem}
        onToggle={toggleItem}
      />

      <div className="rounded-2xl border bg-card p-4 text-center">
        <h3 className="text-sm font-semibold">Publish Details</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isPublished
            ? "This video is marked as published."
            : "When everything above is ready, mark this video as published."}
        </p>
        <div className="mt-3 flex justify-center">
          <Button type="button" onClick={markPublished} disabled={marking || isPublished}>
            {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {isPublished ? "Published" : "Mark as Published"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChecklistCard({
  title,
  items,
  data,
  kind,
  unmapped,
  savingItem,
  onToggle,
}: {
  title: string;
  items: string[];
  data: Record<string, boolean>;
  kind: "uploadChecklist" | "optimizationChecklist" | "finalReviewChecklist";
  unmapped: string[];
  savingItem: string | null;
  onToggle: (
    kind: "uploadChecklist" | "optimizationChecklist" | "finalReviewChecklist",
    item: string,
    checked: boolean,
  ) => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <label key={item} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              className="mt-0.5"
              checked={data[item] === true}
              disabled={savingItem === `${kind}:${item}`}
              onCheckedChange={(v) => onToggle(kind, item, v === true)}
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
      {unmapped.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          This project also has older checklist data not shown above:{" "}
          {unmapped.map((k) => `"${k}" (${data[k] ? "checked" : "unchecked"})`).join(", ")}. It&apos;s
          preserved, just not from today&apos;s checklist wording.
        </p>
      )}
    </div>
  );
}
