"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Replaces the old `window.prompt("Template name")` (2026-09-10) — that
 * native dialog gave no confirmation of what was actually being saved and
 * no way out except typing something or cancelling the browser prompt.
 */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  defaultName,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  saving: boolean;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setName(defaultName ?? "");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            This saves the current design as a new Email Template — it never
            changes what this broadcast sends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="save-template-name">Template name</Label>
          <Input
            id="save-template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Spring Sale Announcement"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || saving}
            onClick={() => onSave(name.trim())}
          >
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
