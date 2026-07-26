"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUpload } from "@/components/community/image-upload";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { uploadStandaloneCourseImage } from "@/lib/community/upload-image";
import type {
  StandaloneCourse,
  StandaloneCourseAccess,
} from "@/types/standalone-courses";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

/**
 * Standalone-course details modal — create a new course or edit an existing
 * one's sales-page settings (cover image, title, about, category, access,
 * publish). Forked from `community/classroom/course-settings-modal.tsx`:
 * no group, no "level" access mode, adds `category` + rich-text `about`
 * (Community's course description is plain text; this one supports
 * formatting per product decision).
 */
export function StandaloneCourseSettingsModal({
  mode,
  saId,
  course,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  saId: string;
  course?: StandaloneCourse | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (courseId: string) => void;
}) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [about, setAbout] = useState("");
  const [category, setCategory] = useState("");
  const [access, setAccess] = useState<StandaloneCourseAccess>("open");
  const [price, setPrice] = useState("");
  const [published, setPublished] = useState(false);
  const [showMemberCount, setShowMemberCount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  // Sync form from the course each time the modal opens (edit) or resets (create).
  useEffect(() => {
    if (!open) return;
    setCoverUrl(course?.coverUrl ?? null);
    setTitle(course?.title ?? "");
    setAbout(course?.aboutHtml ?? "");
    setCategory(course?.category ?? "");
    setAccess(course?.access ?? "open");
    setPrice(course?.priceCents != null ? (course.priceCents / 100).toString() : "");
    setPublished(course?.published ?? false);
    setShowMemberCount(course?.showMemberCount ?? false);
  }, [open, course]);

  async function save() {
    if (!title.trim()) {
      toast.error("Enter a course title");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        aboutHtml: about,
        coverUrl,
        category: category.trim() || null,
        access,
        priceCents:
          access === "purchase" && price.trim()
            ? Math.round(parseFloat(price) * 100)
            : null,
        published,
        showMemberCount,
      };
      const url =
        mode === "create"
          ? `/api/sub-accounts/${saId}/standalone-courses`
          : `/api/sub-accounts/${saId}/standalone-courses/${course!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        course?: { id: string };
      };
      if (!res.ok || d.ok === false) throw new Error(d.error ?? "Couldn't save");
      const id = mode === "create" ? d.course?.id : course!.id;
      if (!id) throw new Error("Couldn't save");
      toast.success(mode === "create" ? "Course created." : "Course saved.");
      onOpenChange(false);
      onSaved(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New course" : "Course settings"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ImageUpload
            label="Cover image"
            hint="The banner on the public sales page. 16:9 works best."
            value={coverUrl}
            onChange={setCoverUrl}
            onUploadingChange={setImgUploading}
            onUpload={(file) =>
              uploadStandaloneCourseImage(
                file,
                saId,
                course?.id ?? "new",
                "cover",
              )
            }
            aspect="video"
          />
          <div className="space-y-1.5">
            <Label htmlFor="m-title">Course title</Label>
            <Input
              id="m-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-category">Category (optional)</Label>
            <Input
              id="m-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Creative"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label>About this course</Label>
            <RichTextEditor
              value={about}
              onChange={setAbout}
              onUploadImage={(file) =>
                uploadStandaloneCourseImage(
                  file,
                  saId,
                  course?.id ?? "new",
                  "lesson",
                )
              }
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="m-access">Access</Label>
              <select
                id="m-access"
                className={SELECT}
                value={access}
                onChange={(e) =>
                  setAccess(e.target.value as StandaloneCourseAccess)
                }
              >
                <option value="open">Free</option>
                <option value="purchase">One-time purchase</option>
              </select>
            </div>
            {access === "purchase" && (
              <div className="space-y-1.5">
                <Label htmlFor="m-price">Price</Label>
                <Input
                  id="m-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="49.00"
                  className="w-28"
                />
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4"
            />
            Published (visible on the public sales page)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showMemberCount}
              onChange={(e) => setShowMemberCount(e.target.checked)}
              className="h-4 w-4"
            />
            Show member count on the sales page
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || imgUploading}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {imgUploading
              ? "Uploading image…"
              : mode === "create"
                ? "Create course"
                : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
