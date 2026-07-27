"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ColorInput } from "@/components/ui/color-input";
import { ImageUpload } from "@/components/community/image-upload";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { ButtonColorFields } from "./button-color-fields";
import { ButtonStateFields } from "./lesson-body-panel";
import { uploadCourseThemeImage } from "@/lib/community/upload-image";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type {
  CourseBlock,
  ProgressSidebarBlock,
  InstructorSidebarBlock,
  CategoryBlockTheme,
  LessonCourseContentBlock,
  LessonDownloadsBlock,
  ButtonAlign,
  ButtonType,
} from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";

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

export function TypeRadio({
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
  onUploadImage,
  otherOffers,
}: {
  block: CourseBlock;
  onChange: (next: CourseBlock) => void;
  /** Kind is always "block" for this form — the caller supplies the right
   *  storage path (course theme vs offer theme) via this closure instead of
   *  this form knowing `saId`/`courseId` directly, so the exact same form
   *  works for both Standalone Courses and Course Offers. */
  onUploadImage: (file: File) => Promise<string>;
  otherOffers: CourseOffer[];
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
              onUploadImage={onUploadImage}
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
            onUpload={onUploadImage}
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
          <ColorInput
            label="Body Text Color"
            value={block.bodyTextColor ?? "#3a3a44"}
            onChange={(v) => onChange({ ...block, bodyTextColor: v })}
          />
          <div className="space-y-1.5">
            <Label>Content</Label>
            <RichTextEditor
              value={block.bodyHtml}
              onChange={(html) => onChange({ ...block, bodyHtml: html })}
              onUploadImage={onUploadImage}
            />
          </div>
          <ImageUpload
            label="Image (optional)"
            hint="1280×720 recommended."
            value={block.imageUrl}
            onChange={(url) => onChange({ ...block, imageUrl: url })}
            onUpload={onUploadImage}
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
              <ButtonColorFields
                color={block.buttonColor}
                borderColor={block.buttonBorderColor ?? block.buttonColor}
                textColor={block.buttonTextColor}
                colorHover={block.buttonColorHover ?? block.buttonColor}
                borderColorHover={block.buttonBorderColorHover ?? block.buttonColor}
                textColorHover={block.buttonTextColorHover ?? block.buttonTextColor}
                onChange={(next) =>
                  onChange({
                    ...block,
                    buttonColor: next.color,
                    buttonBorderColor: next.borderColor,
                    buttonTextColor: next.textColor,
                    buttonColorHover: next.colorHover,
                    buttonBorderColorHover: next.borderColorHover,
                    buttonTextColorHover: next.textColorHover,
                  })
                }
              />
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
            <Label>Offer to promote</Label>
            <select
              value={block.targetOfferId ?? ""}
              onChange={(e) =>
                onChange({ ...block, targetOfferId: e.target.value || null })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select an offer…</option>
              {otherOffers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
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
          <ButtonColorFields
            color={block.buttonColor}
            borderColor={block.buttonBorderColor ?? block.buttonColor}
            textColor={block.buttonTextColor}
            colorHover={block.buttonColorHover ?? block.buttonColor}
            borderColorHover={block.buttonBorderColorHover ?? block.buttonColor}
            textColorHover={block.buttonTextColorHover ?? block.buttonTextColor}
            onChange={(next) =>
              onChange({
                ...block,
                buttonColor: next.color,
                buttonBorderColor: next.borderColor,
                buttonTextColor: next.textColor,
                buttonColorHover: next.colorHover,
                buttonBorderColorHover: next.borderColorHover,
                buttonTextColorHover: next.textColorHover,
              })
            }
          />
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
          <ButtonColorFields
            color={block.buttonColor}
            borderColor={block.buttonBorderColor ?? block.buttonColor}
            textColor={block.buttonTextColor}
            colorHover={block.buttonColorHover ?? block.buttonColor}
            borderColorHover={block.buttonBorderColorHover ?? block.buttonColor}
            textColorHover={block.buttonTextColorHover ?? block.buttonTextColor}
            onChange={(next) =>
              onChange({
                ...block,
                buttonColor: next.color,
                buttonBorderColor: next.borderColor,
                buttonTextColor: next.textColor,
                buttonColorHover: next.colorHover,
                buttonBorderColorHover: next.borderColorHover,
                buttonTextColorHover: next.textColorHover,
              })
            }
          />
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.syncFromProfile}
          onChange={(e) => onChange({ ...block, syncFromProfile: e.target.checked })}
          className="h-4 w-4"
        />
        Sync from course Instructor details
      </label>
      <p className="-mt-2 text-xs text-muted-foreground">
        When on, this block shows the Instructor fields from the course&apos;s
        Settings tab instead of the fields below — unless those are left
        blank, in which case the fields below (e.g. from an applied template)
        are used instead.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={block.headshotVisible ?? true}
          onChange={(e) => onChange({ ...block, headshotVisible: e.target.checked })}
          className="h-4 w-4"
        />
        Show headshot
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
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Heading</Label>
          <Input
            value={block.heading}
            onChange={(e) => onChange({ ...block, heading: e.target.value })}
          />
        </div>
        <ColorInput
          value={block.headingColor ?? "#909090"}
          onChange={(v) => onChange({ ...block, headingColor: v })}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Name</Label>
          <Input
            value={block.name}
            onChange={(e) => onChange({ ...block, name: e.target.value })}
          />
        </div>
        <ColorInput
          value={block.nameColor ?? "#202124"}
          onChange={(v) => onChange({ ...block, nameColor: v })}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Title</Label>
          <Input
            value={block.title}
            onChange={(e) => onChange({ ...block, title: e.target.value })}
          />
        </div>
        <ColorInput
          value={block.titleColor ?? "#909090"}
          onChange={(v) => onChange({ ...block, titleColor: v })}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Bio</Label>
          <Textarea
            value={block.bio}
            onChange={(e) => onChange({ ...block, bio: e.target.value })}
            rows={4}
          />
        </div>
        <ColorInput
          value={block.bioColor ?? "#202124"}
          onChange={(v) => onChange({ ...block, bioColor: v })}
        />
      </div>
    </div>
  );
}

/**
 * The curriculum accordion's own settings ("Category Block" in GHL's
 * naming) — a fixed, non-deletable page element like Progress/Instructor,
 * editing `theme.categoryBlock` directly rather than an entry in the
 * `blocks` array.
 */
export function CategoryBlockForm({
  value,
  onChange,
}: {
  value: CategoryBlockTheme;
  onChange: (next: CategoryBlockTheme) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Background Color"
          value={value.background}
          onChange={(v) => onChange({ ...value, background: v })}
        />
        <ColorInput
          label="Border Color"
          value={value.borderColor}
          onChange={(v) => onChange({ ...value, borderColor: v })}
        />
        <ColorInput
          label="Hover Color"
          value={value.hoverColor}
          onChange={(v) => onChange({ ...value, hoverColor: v })}
        />
      </div>
      <ColorInput
        label="Category Title Color"
        value={value.categoryTitleColor}
        onChange={(v) => onChange({ ...value, categoryTitleColor: v })}
      />
      <ColorInput
        label="Lesson Title Color"
        value={value.lessonTitleColor}
        onChange={(v) => onChange({ ...value, lessonTitleColor: v })}
      />
    </div>
  );
}

/**
 * Lesson page's "Course Content" sidebar block — the current-category
 * lesson list + Previous/Next Category nav, a fixed core block like
 * Instructor/Downloads, not one of the 6 optional block types.
 */
export function CourseContentBlockForm({
  value,
  onChange,
}: {
  value: LessonCourseContentBlock;
  onChange: (next: LessonCourseContentBlock) => void;
}) {
  return (
    <div className="space-y-4">
      <ColorInput
        label="Background Color"
        value={value.background}
        onChange={(v) => onChange({ ...value, background: v })}
      />
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Course Content Heading</Label>
          <Input
            value={value.heading}
            onChange={(e) => onChange({ ...value, heading: e.target.value })}
          />
        </div>
        <ColorInput
          value={value.headingColor}
          onChange={(v) => onChange({ ...value, headingColor: v })}
        />
      </div>
      <ColorInput
        label="Number Of Lessons"
        value={value.lessonCountColor}
        onChange={(v) => onChange({ ...value, lessonCountColor: v })}
      />
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Item hover color"
          value={value.itemHoverColor}
          onChange={(v) => onChange({ ...value, itemHoverColor: v })}
        />
        <ColorInput
          label="Item text color"
          value={value.itemTextColor}
          onChange={(v) => onChange({ ...value, itemTextColor: v })}
        />
        <ColorInput
          label="Item border color"
          value={value.itemBorderColor}
          onChange={(v) => onChange({ ...value, itemBorderColor: v })}
        />
      </div>
      <div className="space-y-3 border-t pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Previous post button
        </p>
        <ButtonStateFields
          value={value.previousButton}
          onChange={(previousButton) => onChange({ ...value, previousButton })}
        />
      </div>
      <div className="space-y-3 border-t pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Next post button
        </p>
        <ButtonStateFields
          value={value.nextButton}
          onChange={(nextButton) => onChange({ ...value, nextButton })}
        />
      </div>
    </div>
  );
}

/**
 * Lesson page's "Downloads" sidebar block — themes the lesson's own
 * `resourceLinks` (already staff-editable elsewhere), a fixed core block
 * like Instructor/Course Content.
 */
export function DownloadsBlockForm({
  value,
  onChange,
}: {
  value: LessonDownloadsBlock;
  onChange: (next: LessonDownloadsBlock) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label>Download Section Heading</Label>
          <Input
            value={value.heading}
            onChange={(e) => onChange({ ...value, heading: e.target.value })}
          />
        </div>
        <ColorInput
          value={value.headingColor}
          onChange={(v) => onChange({ ...value, headingColor: v })}
        />
      </div>
      <ColorInput
        label="Background Color"
        value={value.background}
        onChange={(v) => onChange({ ...value, background: v })}
      />
      <ColorInput
        label="Link Color"
        value={value.linkColor}
        onChange={(v) => onChange({ ...value, linkColor: v })}
      />
    </div>
  );
}
