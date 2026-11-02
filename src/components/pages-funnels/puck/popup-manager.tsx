"use client";

import { createContext, useContext, useState, type FormEvent } from "react";
import { ArrowLeft, MoreHorizontal, PanelTop, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { nextPopupName, popupPublishState } from "@/lib/pages-funnels/popup-editor";
import { cn } from "@/lib/utils";
import type { PopupDefinitionMap } from "@/types/pages-funnels-popup";

/** What the Popups panel needs from the editor shell (Slice 4.5). */
export interface PopupManagerApi {
  popups: PopupDefinitionMap;
  publishedPopups: PopupDefinitionMap | null;
  editingPopupId: string | null;
  create: (name: string) => void;
  edit: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  backToPage: () => void;
}

export const PopupManagerContext = createContext<PopupManagerApi | null>(null);

const STATE_PILL = {
  published: { tone: "success", label: "Published" },
  changed: { tone: "warning", label: "Unpublished changes" },
  draft: { tone: "neutral", label: "Draft" },
} as const;

/**
 * Popups panel (Slice 4.5, approved mockup panel A) — the "Popups" entry in
 * the builder's left rail. Popups belong to THIS page: create (name it →
 * default content → straight into Popup Edit Mode), edit, rename, delete.
 * Trigger settings are not shown until their runtime ships (Slice 6), so a
 * row shows only the Popup's publish state.
 */
export function PopupManagerPanel() {
  const api = useContext(PopupManagerContext);
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "rename"; id: string } | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  if (!api) return <></>;
  const entries = Object.values(api.popups).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name));
  const editing = api.editingPopupId ? api.popups[api.editingPopupId] : null;

  const askDelete = async (id: string) => {
    const popup = api.popups[id];
    if (!popup) return;
    const ok = await confirm({
      title: `Delete “${popup.name}”?`,
      description: "The popup and its content are removed from this page. The live page keeps the last published version until you publish again.",
      confirmLabel: "Delete popup",
      tone: "danger",
    });
    if (ok) api.remove(id);
  };

  return (
    <div className="flex h-full flex-col" data-popup-manager="">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <h2 className="text-foreground text-base font-semibold">Popups</h2>
        <p className="text-caption text-muted-foreground mt-0.5">Manage popups for this page.</p>
        {editing ? (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={api.backToPage}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to Page
          </Button>
        ) : null}
        <Button size="sm" className="mt-3 w-full" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-4" aria-hidden="true" /> Create Popup
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-body-sm">No popups yet. A popup belongs to this page and opens over it.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Popups on this page">
            {entries.map((popup) => {
              const state = STATE_PILL[popupPublishState(popup, api.publishedPopups)];
              const isEditing = popup.id === api.editingPopupId;
              return (
                <li
                  key={popup.id}
                  className={cn("border-border bg-card flex items-center gap-2.5 rounded-lg border p-2.5", isEditing && "border-tag-violet-fg ring-tag-violet-fg/30 ring-2")}
                  data-popup-row={popup.id}
                >
                  <span className="bg-tag-violet-bg text-tag-violet-fg flex size-9 shrink-0 items-center justify-center rounded-md" aria-hidden="true">
                    <PanelTop className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">{popup.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {isEditing ? <span className="text-caption text-tag-violet-fg font-medium">Editing ·</span> : null}
                      <StatusPill tone={state.tone} className="text-micro">{state.label}</StatusPill>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => api.edit(popup.id)} disabled={isEditing} aria-label={`Edit ${popup.name}`}>
                    Edit
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More actions for ${popup.name}`} />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-36">
                      <DropdownMenuItem onClick={() => setDialog({ mode: "rename", id: popup.id })}>
                        <Pencil className="size-4" /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={() => askDelete(popup.id)}>
                        <Trash2 className="size-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <PopupNameDialog
        key={dialog ? (dialog.mode === "rename" ? dialog.id : "create") : "closed"}
        open={!!dialog}
        mode={dialog?.mode ?? "create"}
        initialName={dialog?.mode === "rename" ? (api.popups[dialog.id]?.name ?? "") : nextPopupName(api.popups)}
        onOpenChange={(open) => !open && setDialog(null)}
        onSubmit={(name) => {
          if (dialog?.mode === "rename") api.rename(dialog.id, name);
          else api.create(name);
          setDialog(null);
        }}
      />
      {confirmDialog}
    </div>
  );
}

function PopupNameDialog({
  open,
  mode,
  initialName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "rename";
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSubmit(trimmed);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "Create popup" : "Rename popup"}</DialogTitle>
            <DialogDescription>
              {mode === "create" ? "Name it — you'll go straight to editing its content." : "Shown in the builder, and announced to screen-reader visitors when the popup opens."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="popup-name-input">Popup name</Label>
            <Input id="popup-name-input" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {mode === "create" ? "Create & edit" : "Save name"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
