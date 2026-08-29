"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog as ModalPrimitive } from "@base-ui/react/dialog";
import { Loader2, Pencil, Plus, Trash2, XIcon } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { ImageUpload } from "@/components/community/image-upload";
import { uploadCommunitySettingsImage } from "@/lib/community/upload-image";
import { ABOUT_MAX_CHARS, TAGLINE_MAX_CHARS } from "@/config/community";
import { cn } from "@/lib/utils";
import type { CommunityAboutMediaItem, CommunityGroup } from "@/types/community";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";

function plainTextLength(html: string): number {
  if (typeof window === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
  }
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

/**
 * About tab → "Edit About" (2026-08-29 About-tab cleanup). The canonical,
 * moderator-only About editing surface, reachable directly from the About
 * page itself instead of the old staff-only Manage page. Reuses the exact
 * same content (About rich text, About media gallery, the Join Card image,
 * the card tagline) and the exact same underlying save path
 * (`updateGroupServerSide` via the member-facing Settings PATCH route,
 * moderator-role-gated) — not a second About-editing engine. Saving through
 * THIS route specifically (rather than the staff-only Manage route) is what
 * makes it work for a pure Community moderator with no CRM/staff access,
 * not just staff.
 *
 * Deliberately does NOT include: group name/cover/logo/join policy (already
 * correctly owned by Settings → General — see that page); Access/price/
 * tiers (deferred Access & Membership entitlement architecture, explicitly
 * out of scope for this cleanup pass); review moderation (its one existing
 * remove-review action is still staff-only, a real but separate gap not
 * addressed this pass).
 */
export function AboutEditDialog({
  open,
  onOpenChange,
  saId,
  groupId,
  group,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saId: string;
  groupId: string;
  group: CommunityGroup;
  onSaved: (group: CommunityGroup) => void;
}) {
  const [tagline, setTagline] = useState(group.tagline ?? "");
  const [about, setAbout] = useState(group.aboutHtml || group.about || "");
  const [aboutMedia, setAboutMedia] = useState<CommunityAboutMediaItem[]>(
    group.aboutMedia ?? [],
  );
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(
    group.cardImageUrl ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  const aboutTextCount = plainTextLength(about);

  function updateMedia(index: number, patch: Partial<CommunityAboutMediaItem>) {
    setAboutMedia((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
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

  function handleCancel() {
    if (saving) return;
    onOpenChange(false);
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
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: CommunityGroup;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.group) {
        throw new Error(data.error ?? "Couldn't save About");
      }
      onSaved(data.group);
      toast.success("About page saved.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save About");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogPortal>
        <DialogOverlay />
        <ModalPrimitive.Popup
          data-slot="about-edit-modal-content"
          className={cn(
            // Same hardcoded-light shell every Community modal uses
            // (Create/Edit Channel, PostComposer) — Community stays light
            // regardless of the app's global dark/light class.
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] w-full flex-col gap-0 rounded-t-2xl border-t bg-white text-sm text-[#202124] shadow-lg outline-none transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:right-auto sm:w-full sm:max-w-2xl sm:max-h-[88vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
          )}
        >
          <DialogClose
            data-slot="dialog-close"
            render={<Button variant="ghost" className="absolute top-3 right-3 z-10" size="icon-sm" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>

          <div className="shrink-0 border-b border-[#f0f0f0] px-5 py-4">
            <DialogTitle>Edit About</DialogTitle>
            <p className="mt-0.5 text-sm text-[#909090]">
              What members see on this community&apos;s public About page.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="about-edit-tagline">Tagline</Label>
                <Input
                  id="about-edit-tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value.slice(0, TAGLINE_MAX_CHARS))}
                  maxLength={TAGLINE_MAX_CHARS}
                  placeholder="One short line shown above the community name."
                />
                <p className="text-right text-xs text-[#909090]">
                  {tagline.length}/{TAGLINE_MAX_CHARS}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>About</Label>
                <AboutRichTextEditor value={about} onChange={setAbout} disabled={saving} />
                <p
                  className={cn(
                    "text-right text-xs",
                    aboutTextCount > ABOUT_MAX_CHARS ? "text-destructive" : "text-[#909090]",
                  )}
                >
                  {aboutTextCount}/{ABOUT_MAX_CHARS}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-[#E4E4E4] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>About media gallery</Label>
                    <p className="text-xs text-[#909090]">
                      First item is featured large; up to 8 items render in the gallery.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addMedia("image")}>
                      <Plus className="h-4 w-4" /> Image
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addMedia("video")}>
                      <Plus className="h-4 w-4" /> Video
                    </Button>
                  </div>
                </div>
                {aboutMedia.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#E4E4E4] p-6 text-center text-sm text-[#909090]">
                    No About media yet — the About page will show a clean layout
                    with no media area until you add some.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aboutMedia.map((item, i) => (
                      <div
                        key={item.id}
                        className="grid gap-3 rounded-md border border-[#E4E4E4] p-3 sm:grid-cols-[100px_1fr_auto]"
                      >
                        <div className="text-xs font-medium text-[#909090]">
                          {i === 0 ? "Featured" : `Gallery ${i}`}
                        </div>
                        <div className="grid gap-2">
                          <select
                            className={SELECT_CLASS}
                            value={item.type}
                            onChange={(e) =>
                              updateMedia(i, { type: e.target.value as "image" | "video" })
                            }
                          >
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                          </select>
                          {item.type === "image" ? (
                            <ImageUpload
                              label="Image"
                              value={item.url || null}
                              onChange={(url) => updateMedia(i, { url: url ?? "" })}
                              onUploadingChange={setImgUploading}
                              onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "about")}
                              aspect="video"
                            />
                          ) : (
                            <Input
                              value={item.url}
                              onChange={(e) => updateMedia(i, { url: e.target.value })}
                              placeholder="YouTube, Vimeo, Loom, or Descript URL"
                            />
                          )}
                          <Input
                            value={item.title}
                            onChange={(e) => updateMedia(i, { title: e.target.value })}
                            placeholder="Media title (optional)"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAboutMedia(aboutMedia.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <ImageUpload
                label="Join Card Image"
                hint="Shown at the top of the membership/join card on the About page. Leave empty for a clean card with no image."
                value={cardImageUrl}
                onChange={setCardImageUrl}
                onUploadingChange={setImgUploading}
                onUpload={(file) => uploadCommunitySettingsImage(file, saId, groupId, "card")}
                aspect="video"
              />
            </div>
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || imgUploading}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving…" : imgUploading ? "Uploading…" : "Save About"}
            </Button>
          </div>
        </ModalPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * Self-contained trigger + dialog, so the server-component `CommunityAboutView`
 * can render one client island (same pattern as `JoinButton`/
 * `CommunityReviewForm` elsewhere on this same page) instead of owning the
 * modal's open state itself. Only ever rendered when the caller has already
 * confirmed the viewer is an active moderator — see `CommunityAboutView`.
 * `router.refresh()` after a successful save re-fetches this Server
 * Component page with the new data, so "save → immediately see the real
 * About page" doesn't require a full reload.
 */
export function AboutEditButton({
  saId,
  groupId,
  group,
}: {
  saId: string;
  groupId: string;
  group: CommunityGroup;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit About
      </Button>
      {open && (
        <AboutEditDialog
          open={open}
          onOpenChange={setOpen}
          saId={saId}
          groupId={groupId}
          group={group}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
