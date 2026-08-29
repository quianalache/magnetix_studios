"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Eye,
  GripVertical,
  ImagePlus,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { ImageUpload } from "@/components/community/image-upload";
import { ChannelIconPicker } from "@/components/community/channels/channel-icon-picker";
import { uploadCommunitySettingsImage } from "@/lib/community/upload-image";
import { communityAboutHref, communityHomeHref, type CommunityLinkBase } from "@/lib/community/routes";
import {
  ABOUT_BENEFITS_MAX,
  ABOUT_BENEFIT_DESCRIPTION_MAX,
  ABOUT_BENEFIT_TITLE_MAX,
  ABOUT_MAX_CHARS,
  TAGLINE_MAX_CHARS,
} from "@/config/community";
import { cn } from "@/lib/utils";
import type { CommunityAboutBenefit, CommunityAboutMediaItem } from "@/types/community";

function plainTextLength(html: string): number {
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

export interface AboutEditInitial {
  tagline: string;
  aboutHtml: string;
  about: string;
  aboutMedia: CommunityAboutMediaItem[];
  cardImageUrl: string | null;
  aboutBenefits: CommunityAboutBenefit[];
  showAboutBenefits?: boolean;
}

/**
 * "Edit About" — a dedicated single page (2026-08-30 mockup pass), not the
 * previous pass's modal. Reuses the exact same underlying save path
 * (member-facing, moderator-gated `PATCH /api/community/[saId]/[groupId]/
 * settings`, which both staff and pure Community moderators can already
 * reach) and the exact same content fields that route already accepted —
 * only the presentation moved from a modal to a real page, plus the newly-
 * approved "What You'll Get Inside" benefits editor. Deliberately does NOT
 * include: Community Logo (owned by Settings → General — see Part 21),
 * group name/cover/join policy (same reason), Access/price/tiers (still
 * out of scope), review moderation. No side live-preview panel — "Preview
 * About Page" is a real link to the real page instead, per the explicit
 * instruction not to fake one.
 */
export function AboutEditPage({
  saId,
  pretty,
  staffGroupId,
  groupId,
  groupSlug,
  initial,
}: {
  saId: string;
  pretty: boolean;
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  initial: AboutEditInitial;
}) {
  const router = useRouter();
  const link: CommunityLinkBase = { saId, pretty, staffGroupId };

  const [tagline, setTagline] = useState(initial.tagline ?? "");
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(initial.cardImageUrl ?? null);
  const [about, setAbout] = useState(initial.aboutHtml || initial.about || "");
  const [aboutMedia, setAboutMedia] = useState<CommunityAboutMediaItem[]>(initial.aboutMedia ?? []);
  const [benefits, setBenefits] = useState<CommunityAboutBenefit[]>(initial.aboutBenefits ?? []);
  const [showBenefits, setShowBenefits] = useState(initial.showAboutBenefits !== false);
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  const aboutTextCount = plainTextLength(about);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function updateMedia(id: string, patch: Partial<CommunityAboutMediaItem>) {
    setAboutMedia((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addMedia(type: "image" | "video") {
    setAboutMedia((prev) => [
      ...prev,
      {
        id: `media-${Date.now()}`,
        type,
        url: "",
        title: "",
        thumbnailUrl: null,
        provider: null,
        videoId: null,
        order: prev.length,
      },
    ]);
  }

  function handleMediaDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setAboutMedia((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((item, i) => ({ ...item, order: i }));
    });
  }

  function addBenefit() {
    if (benefits.length >= ABOUT_BENEFITS_MAX) return;
    setBenefits((prev) => [
      ...prev,
      { id: `benefit-${Date.now()}`, icon: "✨", title: "", description: "", order: prev.length },
    ]);
  }

  function updateBenefit(id: string, patch: Partial<CommunityAboutBenefit>) {
    setBenefits((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function handleBenefitDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBenefits((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((b, i) => ({ ...b, order: i }));
    });
  }

  async function save() {
    if (aboutTextCount > ABOUT_MAX_CHARS) {
      toast.error(`About must be ${ABOUT_MAX_CHARS} characters or less.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagline,
          aboutHtml: about,
          aboutMedia,
          cardImageUrl,
          aboutBenefits: benefits,
          showAboutBenefits: showBenefits,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save About");
      toast.success("About page saved.");
      router.push(communityAboutHref(link, groupSlug));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save About");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={communityHomeHref(link, groupSlug)}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            render={<a href={communityAboutHref(link, groupSlug)} target="_blank" rel="noreferrer" />}
          >
            <Eye className="h-3.5 w-3.5" /> Preview About Page
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving || imgUploading}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : imgUploading ? "Uploading…" : "Save About"}
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-foreground">Edit About</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customize what members and visitors see on your community&apos;s About page.
      </p>

      <div className="mt-8 space-y-8">
        {/* 1. Tagline */}
        <section className="space-y-1.5">
          <Label htmlFor="about-edit-tagline" className="text-base font-semibold text-foreground">
            Tagline
          </Label>
          <p className="text-xs text-muted-foreground">
            This short line appears under your community name on the About page.
          </p>
          <Input
            id="about-edit-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX_CHARS))}
            maxLength={TAGLINE_MAX_CHARS}
          />
          <p className="text-right text-xs text-muted-foreground">
            {tagline.length}/{TAGLINE_MAX_CHARS}
          </p>
        </section>

        {/* 2. Join Card Image */}
        <section className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">Join Card Image</h2>
          <p className="text-xs text-muted-foreground">
            This image appears at the top of the join card on your About page.
          </p>
          {/* Sized to mirror the real join card's own ~328px column, not the
              wide Home banner — same 16:9 shape the public card renders,
              just a narrower preview than the generic ImageUpload default
              so this doesn't read as a banner-shaped field. */}
          <div className="max-w-xs">
            <ImageUpload
              label=""
              value={cardImageUrl}
              onChange={setCardImageUrl}
              onUploadingChange={setImgUploading}
              onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "card")}
              aspect="video"
            />
          </div>
        </section>

        {/* 3. About this community */}
        <section className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">About this community</h2>
          <p className="text-xs text-muted-foreground">
            Tell people what your community is about, who it&apos;s for, and what they&apos;ll experience.
          </p>
          <AboutRichTextEditor value={about} onChange={setAbout} disabled={saving} />
          <p
            className={cn(
              "text-right text-xs",
              aboutTextCount > ABOUT_MAX_CHARS ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {aboutTextCount}/{ABOUT_MAX_CHARS}
          </p>
        </section>

        {/* 4. About media — one unified sortable list, not split Featured/Additional */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">About media</h2>
              <p className="text-xs text-muted-foreground">
                Add images and videos to showcase your community. Drag to reorder — the first item
                appears large on your About page.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addMedia("image")}>
                <Plus className="h-3.5 w-3.5" /> Image
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addMedia("video")}>
                <Plus className="h-3.5 w-3.5" /> Video
              </Button>
            </div>
          </div>

          {aboutMedia.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No About media yet — the About page will show a clean layout with no media area until
              you add some.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMediaDragEnd}>
              <SortableContext items={aboutMedia.map((m) => m.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {aboutMedia.map((item) => (
                    <MediaEditRow
                      key={item.id}
                      item={item}
                      saId={saId}
                      groupId={groupId}
                      onChange={(patch) => updateMedia(item.id, patch)}
                      onRemove={() => setAboutMedia((prev) => prev.filter((m) => m.id !== item.id))}
                      onUploadingChange={setImgUploading}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </section>

        {/* 5. What You'll Get Inside */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                What You&apos;ll Get Inside <span className="font-normal text-muted-foreground">(optional)</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Highlight the key benefits members receive in your community. Up to {ABOUT_BENEFITS_MAX} items.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Label htmlFor="about-edit-show-benefits" className="text-xs text-muted-foreground">
                Show this section
              </Label>
              <Switch id="about-edit-show-benefits" checked={showBenefits} onCheckedChange={setShowBenefits} />
            </div>
          </div>

          {benefits.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No benefits added yet.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBenefitDragEnd}>
              <SortableContext items={benefits.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {benefits.map((benefit) => (
                    <BenefitEditRow
                      key={benefit.id}
                      benefit={benefit}
                      onChange={(patch) => updateBenefit(benefit.id, patch)}
                      onRemove={() => setBenefits((prev) => prev.filter((b) => b.id !== benefit.id))}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addBenefit}
            disabled={benefits.length >= ABOUT_BENEFITS_MAX}
          >
            <Plus className="h-3.5 w-3.5" /> Add Benefit ({benefits.length}/{ABOUT_BENEFITS_MAX})
          </Button>
        </section>
      </div>

      <div className="mt-10 flex items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" render={<Link href={communityHomeHref(link, groupSlug)} />}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving || imgUploading}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save About"}
        </Button>
      </div>
    </div>
  );
}

/** One compact, 16:9-thumbnailed, horizontally-sortable media row — deliberately
 *  restrained (Part 20): no type dropdown (type is fixed at creation by which
 *  "+ Image"/"+ Video" button was used), just a thumbnail/URL field, an
 *  optional title, a drag handle, and delete. */
function MediaEditRow({
  item,
  saId,
  groupId,
  onChange,
  onRemove,
  onUploadingChange,
}: {
  item: CommunityAboutMediaItem;
  saId: string;
  groupId: string;
  onChange: (patch: Partial<CommunityAboutMediaItem>) => void;
  onRemove: () => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="w-[168px] shrink-0 space-y-1.5">
      <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="absolute left-1 top-1 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded bg-black/55 text-white hover:bg-black/70 active:cursor-grabbing"
          aria-label="Reorder media item"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded bg-black/55 text-white hover:bg-black/70"
          aria-label="Remove media item"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {item.type === "image" ? (
          <CompactImageSlot
            value={item.url || null}
            onChange={(url) => onChange({ url: url ?? "" })}
            onUploadingChange={onUploadingChange}
            onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "about")}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
            <Play className="h-5 w-5" />
            <span className="text-[10px]">Video</span>
          </div>
        )}
      </div>

      {item.type === "video" && (
        <Input
          value={item.url}
          onChange={(e) => onChange({ url: e.target.value })}
          placeholder="Video URL"
          className="h-7 text-xs"
        />
      )}
      <Input
        value={item.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Title (optional)"
        className="h-7 text-xs"
      />
      <p className="text-[10px] text-muted-foreground">{item.type === "video" ? "Video" : "Image"}</p>
    </div>
  );
}

/** A compact, click-to-upload 16:9 image slot — the same upload mechanism
 *  as `ImageUpload`, but sized to fit inside a 168px media row instead of
 *  that component's fixed larger box (Part 19: "compact enough that
 *  several can be seen ... in one row"). */
function CompactImageSlot({
  value,
  onChange,
  onUploadingChange,
  onUpload,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  onUploadingChange: (uploading: boolean) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    onUploadingChange(true);
    try {
      onChange(await onUpload(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  if (value) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt=""
        className="h-full w-full cursor-pointer object-cover"
        onClick={(e) => (e.currentTarget.nextElementSibling as HTMLInputElement)?.click()}
      />
    );
  }

  return (
    <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/70">
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      <span className="text-[10px]">{uploading ? "Uploading…" : "Upload"}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
    </label>
  );
}

function BenefitEditRow({
  benefit,
  onChange,
  onRemove,
}: {
  benefit: CommunityAboutBenefit;
  onChange: (patch: Partial<CommunityAboutBenefit>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: benefit.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 rounded-md border p-3">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-2 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Reorder benefit"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="shrink-0 pt-0.5">
        <ChannelIconPicker value={benefit.icon} onChange={(icon) => onChange({ icon })} />
      </div>

      <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
        <div>
          <Input
            value={benefit.title}
            onChange={(e) => onChange({ title: e.target.value.slice(0, ABOUT_BENEFIT_TITLE_MAX) })}
            placeholder="Title"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Textarea
            value={benefit.description}
            onChange={(e) =>
              onChange({ description: e.target.value.slice(0, ABOUT_BENEFIT_DESCRIPTION_MAX) })
            }
            placeholder="Short description"
            rows={1}
            className="min-h-8 text-sm"
          />
        </div>
      </div>

      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Delete benefit">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
