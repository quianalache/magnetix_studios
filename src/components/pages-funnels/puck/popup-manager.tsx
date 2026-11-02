"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PopupDefinition, PopupDefinitionMap } from "@/types/pages-funnels-popup";
import { createDefaultPopup } from "@/types/pages-funnels-popup";

export function PopupManager({ popups, onChange }: { popups: PopupDefinitionMap; onChange: (next: PopupDefinitionMap) => void }) {
  const [open, setOpen] = useState(false);
  const entries = Object.values(popups);
  const create = () => {
    const id = `popup_${crypto.randomUUID().replaceAll("-", "")}`;
    onChange({ ...popups, [id]: createDefaultPopup(id, `Popup ${entries.length + 1}`) });
    setOpen(true);
  };
  const update = (popup: PopupDefinition) => onChange({ ...popups, [popup.id]: popup });
  const remove = (id: string) => {
    const next = { ...popups };
    delete next[id];
    onChange(next);
  };
  return (
    <div className="border-border bg-card border-b px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>Popups ({entries.length})</Button>
        <Button variant="outline" size="sm" onClick={create}>Add popup</Button>
        <span className="text-muted-foreground">Draft-only definitions; runtime triggers are not enabled in Slice 3.</span>
      </div>
      {open && entries.length > 0 && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {entries.map((popup) => (
            <div key={popup.id} className="border-border rounded-md border p-2">
              <label className="block text-xs font-medium">Name
                <input className="border-input bg-background mt-1 w-full rounded border px-2 py-1" value={popup.name} onChange={(event) => update({ ...popup, name: event.target.value })} />
              </label>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">ID: {popup.id}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(popup.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
