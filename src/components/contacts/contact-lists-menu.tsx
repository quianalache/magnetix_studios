"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ListFilter, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContactListView } from "@/types/contact-lists";
import type { ConditionGroup } from "@/types/workflows";

/**
 * Contact Lists menu (Contacts redesign, 2026-09-25) — saved, dynamic
 * segments. Choosing a list loads its conditions into the filters; "Save
 * as list" stores the current filters (never a copy of the contacts), and
 * the creator / an admin can update, rename or delete a list. Lists are
 * also offered as Broadcast audiences.
 */
export function ContactListsMenu({
  subAccountId,
  lists,
  activeList,
  currentGroup,
  dirty,
  onSelect,
  onChanged,
}: {
  subAccountId: string;
  lists: ContactListView[];
  activeList: ContactListView | null;
  /** The filters currently applied (complete conditions only). */
  currentGroup: ConditionGroup;
  /** Current filters differ from the active list's saved conditions. */
  dirty: boolean;
  onSelect: (list: ContactListView | null) => void;
  /** Called after create/update/delete with the affected list (or null). */
  onChanged: (list: ContactListView | null, deletedId?: string) => void;
}) {
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "rename"; list: ContactListView }
    | { mode: "delete"; list: ContactListView }
    | null
  >(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const hasFilters = currentGroup.all.length > 0;

  function openCreate() {
    setName("");
    setDescription("");
    setDialog({ mode: "create" });
  }

  async function request(url: string, init: RequestInit) {
    const res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json" },
    });
    const body = (await res.json().catch(() => ({}))) as { list?: ContactListView; error?: string };
    if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
    return body;
  }

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === "create") {
        const body = await request(`/api/sub-accounts/${subAccountId}/contact-lists`, {
          method: "POST",
          body: JSON.stringify({ name, description, group: currentGroup }),
        });
        toast.success(`Saved "${body.list?.name}"`);
        onChanged(body.list ?? null);
      } else if (dialog.mode === "rename") {
        const body = await request(
          `/api/sub-accounts/${subAccountId}/contact-lists/${dialog.list.id}`,
          { method: "PATCH", body: JSON.stringify({ name, description }) },
        );
        toast.success("List updated");
        onChanged(body.list ?? null);
      } else {
        await request(`/api/sub-accounts/${subAccountId}/contact-lists/${dialog.list.id}`, {
          method: "DELETE",
        });
        toast.success(`Deleted "${dialog.list.name}"`);
        onChanged(null, dialog.list.id);
      }
      setDialog(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function saveChanges() {
    if (!activeList) return;
    setBusy(true);
    try {
      const body = await request(
        `/api/sub-accounts/${subAccountId}/contact-lists/${activeList.id}`,
        { method: "PATCH", body: JSON.stringify({ group: currentGroup }) },
      );
      toast.success(`Updated "${activeList.name}"`);
      onChanged(body.list ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the list.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {activeList && dirty && activeList.canEdit && hasFilters && (
        <Button variant="outline" size="sm" onClick={saveChanges} disabled={busy} className="h-9 gap-1.5 rounded-full">
          <Save className="h-3.5 w-3.5" />
          Update list
        </Button>
      )}
      {hasFilters && (!activeList || dirty) && (
        <Button variant="outline" size="sm" onClick={openCreate} className="h-9 gap-1.5 rounded-full">
          <Plus className="h-3.5 w-3.5" />
          Save as list
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 rounded-full border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            />
          }
        >
          <ListFilter className="h-3.5 w-3.5" />
          Contact Lists
          <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {/* Base UI requires a label inside a Menu.Group (a bare label
              crashes the menu on open — same fix as community-account-menu). */}
          <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs">Saved lists · update automatically</DropdownMenuLabel>
          {lists.length === 0 && (
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              No lists yet. Filter your contacts, then choose &ldquo;Save as list&rdquo;.
            </p>
          )}
          {lists.map((l) => (
            <DropdownMenuItem key={l.id} onClick={() => onSelect(l)} className="flex items-start gap-2">
              <Check
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${activeList?.id === l.id ? "text-primary" : "opacity-0"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{l.name}</span>
                {l.description && (
                  <span className="block truncate text-[11px] text-muted-foreground">{l.description}</span>
                )}
              </span>
            </DropdownMenuItem>
          ))}
          </DropdownMenuGroup>
          {activeList && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSelect(null)}>Show all contacts</DropdownMenuItem>
              {activeList.canEdit && (
                <>
                  <DropdownMenuItem
                    onClick={() => {
                      setName(activeList.name);
                      setDescription(activeList.description);
                      setDialog({ mode: "rename", list: activeList });
                    }}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Rename “{activeList.name}”
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDialog({ mode: "delete", list: activeList })}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete list
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <DialogContent>
          {dialog?.mode === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete &ldquo;{dialog.list.name}&rdquo;?</DialogTitle>
                <DialogDescription>
                  Only the saved filter is deleted — no contacts are removed. Any
                  unsent broadcast draft using this list will need a new audience.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={submit} disabled={busy}>
                  {busy ? "Deleting…" : "Delete list"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{dialog?.mode === "rename" ? "Rename list" : "Save as Contact List"}</DialogTitle>
                <DialogDescription>
                  {dialog?.mode === "rename"
                    ? "Change the list's name or description. Its filters stay the same."
                    : "Saves these filters. Contacts join and leave the list automatically as their details change."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="list-name">Name</Label>
                  <Input
                    id="list-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    placeholder="e.g. VIP clients who bought the course"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="list-description">Description (optional)</Label>
                  <Textarea
                    id="list-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={300}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={busy || !name.trim()}>
                  {busy ? "Saving…" : dialog?.mode === "rename" ? "Save" : "Save list"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
