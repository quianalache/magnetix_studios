"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorInput } from "@/components/ui/color-input";
import { ImageUpload } from "@/components/community/image-upload";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { uploadCourseThemeImage } from "@/lib/community/upload-image";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type {
  CourseBlock,
  ProgressSidebarBlock,
  InstructorSidebarBlock,
  ButtonAlign,
  ButtonType,
} from "@/types/course-theme";
import type { StandaloneCourse } from "@/types/standalone-courses";

const RADIO = "flex items-center gap-1.5 text-xs";

function AlignRadio({
  value,
  onChange,
}: {
  value: ButtonAlign;
  onChange: (v: ButtonAlign) => void;
}) {
  return (
    <div className="flex gap-3">
      {(["left", "center", "right"] as const).map((a) => (
        <label key={a} className={RADIO}>
          <input
            type="radio"
            checked={value === a}
            onChange={() => onChange(a)}
            className="h-3.5 w-3.5"
          />
          {a}
        </label>
      ))}
    </div>
  );
}

function TypeRadio({
  value,
  onChange,
}: {
  value: ButtonType;
  onChange: (v: ButtonType) => void;
}) {
  return (
    <div className="flex gap-3">
      {(["solid", "link"] as const).map((t) => (
        <label key={t} className={RADIO}>
          <input
            type="radio"
            checked={value === t}
            onChange={() => onChange(t)}
            className="h-3.5 w-3.5"
          />
          {t === "solid" ? "Solid Button" : "Link"}
        </label>
      ))}
    </div>
  );
}

/**
 * One settings form per optional block type, dispatched by `block.type`.
 * Every color field uses `ColorInput`; Text/Custom reuse the same
 * `RichTextEditor` + `uploadCourseThemeImage` pattern as the lesson editor.
 */
export function BlockForm({
  block,
  onChange,
  saId,
  courseId,
  otherCourses,
}: {
  block: CourseBlock;
  onChange: (next: CourseBlock) => void;
  saId: string;
  courseId: string;
  otherCourses: StandaloneCourse[];
}) {
  switch (block.type) {
    case "text":
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Background Color"
              value={block.background}
              onChange={(v) => onChange({ ...block, background: v })}
            />
            <ColorInput
              label="Text Color"
              value={block.textColor}
              onChange={(v) => onChange({ ...block, textColor: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <RichTextEditor
              value={block.bodyHtml}
              onChange={(html) => onChange({ ...block, bodyHtml: html })}
              onUploadImage={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
            />
          </div>
        </div>
      );

    case "image":
      return (
        <div className="space-y-3">
          <ImageUpload
            label="Image"
            hint="1280×720 recommended."
            value={block.imageUrl}
            onChange={(url) => onChange({ ...block, imageUrl: url })}
            onUpload={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
          />
          <div className="space-y-1.5">
            <Label>Go to URL</Label>
            <Input
              value={block.linkUrl ?? ""}
              onChange={(e) => onChange({ ...block, linkUrl: e.target.value || null })}
              placeholder="Eg: https://abc.com"
            />
          </div>
        </div>
      );

    case "video": {
      const parsed = block.videoUrl ? parseVideoUrl(block.videoUrl) : null;
      const invalid = !!block.videoUrl && !parsed;
      return (
        <div className="space-y-1.5">
          <Label>Video URL (YouTube, Vimeo, Loom, or Descript)</Label>
          <Input
            value={block.videoUrl ?? ""}
            onChange={(e) => {
              const url = e.target.value;
              const p = url ? parseVideoUrl(url) : null;
              onChange({
                ...block,
                videoUrl: url || null,
                videoProvider: p?.provider ?? null,
                videoId: p?.id ?? null,
              });
            }}
            placeholder="https://youtube.com/watch?v=…"
          />
          {invalid && (
            <p className="text-xs text-destructive">
              Not a recognized YouTube, Vimeo, Loom, or Descript link.
            </p>
          )}
          {parsed && (
            <div className="aspect-video w-full max-w-sm overflow-hidden rounded-lg border bg-black">
              <iframe src={parsed.embedUrl} title="preview" className="h-full w-full" />
            </div>
          )}
        </div>
      );
    }

    case "custom":
      return (
        <div className="space-y-3">
          <div className="flex flex-col gap-3">
            <div className="space-y-1.5">
              <Label>Heading</Label>
              <Input
                value={block.heading}
                onChange={(e) => onChange({ ...block, heading: e.target.value })}
              />
            </div>
            <ColorInput
              label="Heading Color"
              value={block.headingColor}
              onChange={(v) => onChange({ ...block, headingColor: v })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Background Color"
              value={block.background}
              onChange={(v) => onChange({ ...block, background: v })}
            />
            <ColorInput
              label="Border Color"
              value={block.borderColor}
              onChange={(v) => onChange({ ...block, borderColor: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <RichTextEditor
              value={block.bodyHtml}
              onChange={(html) => onChange({ ...block, bodyHtml: html })}
              onUploadImage={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
            />
          </div>
          <ImageUpload
            label="Image (optional)"
            hint="1280×720 recommended."
            value={block.imageUrl}
            onChange={(url) => onChange({ ...block, imageUrl: url })}
            onUpload={(file) => uploadCourseThemeImage(file, saId, courseId, "block")}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.buttonVisible}
              onChange={(e) => onChange({ ...block, buttonVisible: e.target.checked })}
              className="h-4 w-4"
            />
            Show button
          </label>
          {block.buttonVisible && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <Label>Button Text</Label>
                <Input
                  value={block.buttonText}
                  onChange={(e) => onChange({ ...block, buttonText: e.target.value })}
                />
              </div>
              <TypeRadio
                value={block.buttonType}
                onChange={(v) => onChange({ ...block, buttonType: v })}
              />
              <AlignRadio
                value={block.buttonAlign}
                onChange={(v) => onChange({ ...block, buttonAlign: v })}
              />
              <div className="flex flex-col gap-3">
                <ColorInput
                  label="Button Color"
                  value={block.buttonColor}
                  onChange={(v) => onChange({ ...block, buttonColor: v })}
                />
                <ColorInput
                  label="Button Text Color"
                  value={block.buttonTextColor}
                  onChange={(v) => onChange({ ...block, buttonTextColor: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Go to URL</Label>
                <Input
                  value={block.linkUrl}
                  onChange={(e) => onChange({ ...block, linkUrl: e.target.value })}
                  placeholder="Eg: https://abc.com"
                />
              </div>
            </div>
          )}
        </div>
      );

    case "crossSell":
      return (
        <div className="space-y-3">
          <ColorInput
            label="Background Color"
            value={block.background}
            onChange={(v) => onChange({ ...block, background: v })}
          />
          <div className="space-y-1.5">
            <Label>Course to promote</Label>
            <select
              value={block.targetCourseId ?? ""}
              onChange={(e) =>
                onChange({ ...block, targetCourseId: e.target.value || null })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select a course…</option>
              {otherCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Title Color"
              value={block.titleColor}
              onChange={(v) => onChange({ ...block, titleColor: v })}
            />
            <ColorInput
              label="Price Color"
              value={block.priceColor}
              onChange={(v) => onChange({ ...block, priceColor: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Button Text</Label>
            <Input
              value={block.buttonText}
              onChange={(e) => onChange({ ...block, buttonText: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Button Color"
              value={block.buttonColor}
              onChange={(v) => onChange({ ...block, buttonColor: v })}
            />
            <ColorInput
              label="Button Text Color"
              value={block.buttonTextColor}
              onChange={(v) => onChange({ ...block, buttonTextColor: v })}
            />
          </div>
        </div>
      );

    case "callToAction":
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Button Text</Label>
            <Input
              value={block.buttonText}
              onChange={(e) => onChange({ ...block, buttonText: e.target.value })}
            />
          </div>
          <TypeRadio
            value={block.buttonType}
            onChange={(v) => onChange({ ...block, buttonType: v })}
          />
          <AlignRadio
            value={block.buttonAlign}
            onChange={(v) => onChange({ ...block, buttonAlign: v })}
          />
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Button Color"
              value={block.buttonColor}
              onChange={(v) => onChange({ ...block, buttonColor: v })}
            />
            <ColorInput
              label="Button Text Color"
              value={block.buttonTextColor}
              onChange={(v) => onChange({ ...block, buttonTextColor: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Go to URL</Label>
            <Input
              value={block.linkUrl}
              onChange={(e) => onChange({ ...block, linkUrl: e.target.value })}
              placeholder="Eg: https://abc.com"
            />
          </div>
        </div>
      );
  }
}

export function ProgressBlockForm({
  block,
  onChange,
  saId,
  courseId,
}: {
  block: ProgressSidebarBlock;
  onChange: (next: ProgressSidebarBlock) => void;
  saId: string;
  courseId: string;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.visible}
          onChange={(e) => onChange({ ...block, visible: e.target.checked })}
          className="h-4 w-4"
        />
        Show progress bar
      </label>
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Background color"
          value={block.background}
          onChange={(v) => onChange({ ...block, background: v })}
        />
        <ColorInput
          label="Progress bar color"
          value={block.barColor}
          onChange={(v) => onChange({ ...block, barColor: v })}
        />
      </div>
      <ColorInput
        label="Progress bar text color"
        value={block.textColor}
        onChange={(v) => onChange({ ...block, textColor: v })}
      />
      <div className="space-y-1.5">
        <Label>Text</Label>
        <Input
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      </div>
      <ImageUpload
        label="Promo image"
        hint="1280×720 recommended."
        value={block.promoImageUrl}
        onChange={(url) => onChange({ ...block, promoImageUrl: url })}
        onUpload={(file) => uploadCourseThemeImage(file, saId, courseId, "progress-promo")}
      />
    </div>
  );
}

export function InstructorBlockForm({
  block,
  onChange,
  saId,
  courseId,
}: {
  block: InstructorSidebarBlock;
  onChange: (next: InstructorSidebarBlock) => void;
  saId: string;
  courseId: string;
}) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.visible}
          onChange={(e) => onChange({ ...block, visible: e.target.checked })}
          className="h-4 w-4"
        />
        Show instructor block
      </label>
      <ImageUpload
        label="Headshot"
        hint="Square, ~100×100."
        aspect="square"
        value={block.headshotUrl}
        onChange={(url) => onChange({ ...block, headshotUrl: url })}
        onUpload={(file) => uploadCourseThemeImage(file, saId, courseId, "instructor-headshot")}
      />
      <ColorInput
        label="Background Color"
        value={block.background}
        onChange={(v) => onChange({ ...block, background: v })}
      />
      <div className="flex flex-col gap-3">
        <div className="space-y-1.5">
          <Label>Heading</Label>
          <Input
            value={block.heading}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={block.name}
            onChange={(e) => onChange({ ...block, name: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Bio</Label>
        <Textarea
          value={block.bio}
          onChange={(e) => onChange({ ...block, bio: e.target.value })}
          rows={4}
        />
      </div>
    </div>
  );
}
