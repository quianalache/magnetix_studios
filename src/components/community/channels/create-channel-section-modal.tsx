"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog as ModalPrimitive } from "@base-ui/react/dialog";
import { Hash, Loader2, MessageSquare, XIcon } from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChannelIconPicker } from "@/components/community/channels/channel-icon-picker";
import { cn } from "@/lib/utils";
import type { CommunityChannel, CommunitySection } from "@/types/community";

const DESCRIPTION_MAX = 500;

type Kind = "channel" | "section";

/**
 * ONE modal for both Create AND Edit, both Channel AND Section — the
 * approved mock-up's two-selector-card shell reused for all four flows
 * (Part "Create Channel/Section Modal" + "Edit Channel"/"Edit Section"
 * both explicitly say "reuse the same form architecture", not build a
 * second one). In edit mode the kind is fixed to whatever's being edited
 * (no selector shown) and the title/submit label switch to "Edit
 * Channel"/"Edit Section" — same reuse pattern PostComposer already
 * established for its own Create/Edit modal.
 *
 * Same responsive Dialog shell PostComposer uses (full-bleed bottom sheet
 * on mobile, true centered dialog on desktop, built directly on
 * `@base-ui/react/dialog` rather than `SheetContent`/`DialogContent` — see
 * that component's own module comment for exactly why) — proven in
 * production during the composer correction pass, reused here rather than
 * re-solving the same centering problem a second time.
 */
export function CreateChannelSectionModal({
  open,
  onOpenChange,
  saId,
  groupId,
  sections,
  editingChannel,
  editingSection,
  onChannelSaved,
  onSectionSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saId: string;
  groupId: string;
  sections: CommunitySection[];
  /** Present = editing this exact channel (kind fixed to "channel"). */
  editingChannel?: CommunityChannel;
  /** Present = editing this exact section (kind fixed to "section"). */
  editingSection?: CommunitySection;
  onChannelSaved?: (channel: CommunityChannel) => void;
  onSectionSaved?: (section: CommunitySection) => void;
}) {
  const isEdit = !!editingChannel || !!editingSection;
  const [kind, setKind] = useState<Kind>(editingSection ? "section" : "channel");

  const [name, setName] = useState(editingChannel?.name ?? editingSection?.name ?? "");
  const [icon, setIcon] = useState(editingChannel?.icon ?? editingSection?.icon ?? "");
  const [description, setDescription] = useState(editingChannel?.description ?? "");
  const [isPrivate, setIsPrivate] = useState(editingChannel?.private ?? editingSection?.private ?? false);
  const [readOnly, setReadOnly] = useState(editingChannel?.readOnly ?? false);
  const [sectionId, setSectionId] = useState<string>(editingChannel?.sectionId ?? "");
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const canSubmit = !!trimmedName && !!icon && !saving;

  function handleCancel() {
    onOpenChange(false);
  }

  async function submit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (kind === "channel") {
        const url = editingChannel
          ? `/api/community/${saId}/${groupId}/channels/${editingChannel.id}`
          : `/api/community/${saId}/${groupId}/channels`;
        const res = await fetch(url, {
          method: editingChannel ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            icon,
            description,
            private: isPrivate,
            readOnly,
            sectionId: sectionId || null,
          }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          channel?: CommunityChannel;
          error?: string;
        };
        if (!res.ok || !d.ok || !d.channel) throw new Error(d.error ?? "Couldn't save channel");
        onChannelSaved?.(d.channel);
        toast.success(editingChannel ? "Channel updated" : "Channel created");
      } else {
        const url = editingSection
          ? `/api/community/${saId}/${groupId}/sections/${editingSection.id}`
          : `/api/community/${saId}/${groupId}/sections`;
        const res = await fetch(url, {
          method: editingSection ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName, icon, private: isPrivate }),
        });
        const d = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          section?: CommunitySection;
          error?: string;
        };
        if (!res.ok || !d.ok || !d.section) throw new Error(d.error ?? "Couldn't save section");
        onSectionSaved?.(d.section);
        toast.success(editingSection ? "Section updated" : "Section created");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  const title = isEdit
    ? kind === "channel"
      ? "Edit Channel"
      : "Edit Section"
    : "Create Channel/Section";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogPortal>
        <DialogOverlay />
        <ModalPrimitive.Popup
          data-slot="channel-modal-content"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] w-full flex-col gap-0 rounded-t-2xl border-t bg-background text-sm shadow-lg outline-none transition duration-200 ease-in-out data-ending-style:opacity-0 data-starting-style:opacity-0",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:max-h-[85vh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border",
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
            <DialogTitle>{title}</DialogTitle>
            <p className="mt-0.5 text-sm text-[#909090]">
              Set a relatable name and explain the purpose of this channel.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!isEdit && (
              <div className="mb-5 grid grid-cols-2 gap-3">
                <SelectorCard
                  active={kind === "channel"}
                  icon={<Hash className="h-4 w-4" />}
                  title="Channel"
                  description="Create a channel for conversations and updates."
                  onClick={() => setKind("channel")}
                />
                <SelectorCard
                  active={kind === "section"}
                  icon={<MessageSquare className="h-4 w-4" />}
                  title="Section"
                  description="Create a section to organize channels in the sidebar."
                  onClick={() => setKind("section")}
                />
              </div>
            )}

            {kind === "channel" ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ccs-channel-name">
                      Channel Name <span className="text-destructive">*</span>
                    </Label>
                    <input
                      id="ccs-channel-name"
                      value={name}
                      onChange={(e) => setName(e.target.value.slice(0, 60))}
                      placeholder="e.g. Daily Motivation"
                      className="w-full rounded-md border border-[#E4E4E4] px-3 py-2 text-sm outline-none focus:border-[#b4b4b4]"
                    />
                    <p className="text-xs text-[#909090]">Give this channel a clear, descriptive name.</p>
                  </div>
                  <div className="space-y-1.5">
                    <ChannelIconPicker
                      value={icon}
                      onChange={setIcon}
                      label={
                        <>
                          Icon <span className="text-destructive">*</span>
                        </>
                      }
                    />
                    <p className="text-xs text-[#909090]">Choose an emoji or icon to represent this channel.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ccs-channel-desc">Description</Label>
                  <textarea
                    id="ccs-channel-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                    placeholder="What's this channel about?"
                    rows={3}
                    className="w-full resize-none rounded-md border border-[#E4E4E4] px-3 py-2 text-sm outline-none focus:border-[#b4b4b4]"
                  />
                  <div className="flex items-center justify-between text-xs text-[#909090]">
                    <span>Help others understand what discussions belong here.</span>
                    <span>
                      {description.length}/{DESCRIPTION_MAX}
                    </span>
                  </div>
                </div>

                <ToggleRow
                  checked={isPrivate}
                  onChange={setIsPrivate}
                  title="Private Channel"
                  description="Only invited members can join and view this channel."
                />
                <ToggleRow
                  checked={readOnly}
                  onChange={setReadOnly}
                  title="Read Only Channel"
                  description="Only admins and moderators can create posts. Members can view and comment."
                />

                <div className="space-y-1.5">
                  <Label htmlFor="ccs-channel-section">Section (Optional)</Label>
                  <select
                    id="ccs-channel-section"
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    className="w-full rounded-md border border-[#E4E4E4] bg-white px-3 py-2 text-sm"
                  >
                    <option value="">No Section (Unsectioned)</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[#909090]">Assign this channel to a section, or leave it unsectioned.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ccs-section-name">
                    Section Name <span className="text-destructive">*</span>
                  </Label>
                  <input
                    id="ccs-section-name"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 60))}
                    placeholder="e.g. Coaching & Support"
                    className="w-full rounded-md border border-[#E4E4E4] px-3 py-2 text-sm outline-none focus:border-[#b4b4b4]"
                  />
                  <p className="text-xs text-[#909090]">Choose a clear name to organize related channels.</p>
                </div>

                <ChannelIconPicker
                  value={icon}
                  onChange={setIcon}
                  label={
                    <>
                      Icon <span className="text-destructive">*</span>
                    </>
                  }
                />
                <p className="-mt-2 text-xs text-[#909090]">Choose an icon to help members quickly identify this section.</p>

                <ToggleRow
                  checked={isPrivate}
                  onChange={setIsPrivate}
                  title="Private Section"
                  description="Only invited members can see channels inside this section (if section privacy is enforced)."
                />
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={!canSubmit}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {kind === "channel"
                ? isEdit
                  ? "Save Channel"
                  : "Create Channel"
                : isEdit
                  ? "Save Section"
                  : "Create Section"}
            </Button>
          </div>
        </ModalPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

function SelectorCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors",
        active ? "border-2 border-[#7C3AED] bg-[#7C3AED]/5" : "border-[#E4E4E4] hover:border-[#d4d4d4]",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          active ? "bg-[#7C3AED]/15 text-[#7C3AED]" : "bg-[#F5F4F2] text-[#909090]",
        )}
      >
        {icon}
      </span>
      <span className="text-sm font-semibold text-[#202124]">{title}</span>
      <span className="text-xs text-[#909090]">{description}</span>
    </button>
  );
}

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#E4E4E4] p-3">
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors" style={{ backgroundColor: checked ? "#7C3AED" : "#E4E4E4" }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      <span>
        <span className="block text-sm font-medium text-[#202124]">{title}</span>
        <span className="block text-xs text-[#909090]">{description}</span>
      </span>
    </label>
  );
}
