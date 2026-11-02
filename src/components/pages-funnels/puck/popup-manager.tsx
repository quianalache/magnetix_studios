"use client";

import { useState } from "react";
import { ArrowLeft, Edit3, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PopupDefinition, PopupDefinitionMap, PopupStyle } from "@/types/pages-funnels-popup";
import { createDefaultPopup } from "@/types/pages-funnels-popup";

interface PopupManagerProps {
  popups: PopupDefinitionMap;
  onChange: (next: PopupDefinitionMap) => void;
  onPreview?: (id: string) => void;
  onEdit?: (id: string) => void;
  editingPopupId?: string | null;
  onBackToPage?: () => void;
}

export function PopupManager({ popups, onChange, onPreview, onEdit, editingPopupId, onBackToPage }: PopupManagerProps) {
  const [open, setOpen] = useState(false);
  const entries = Object.values(popups);
  const editingPopup = editingPopupId ? popups[editingPopupId] : null;
  const create = () => {
    const id = `popup_${crypto.randomUUID().replaceAll("-", "")}`;
    onChange({ ...popups, [id]: createDefaultPopup(id, `Popup ${entries.length + 1}`) });
    setOpen(true);
  };
  const update = (popup: PopupDefinition) => onChange({ ...popups, [popup.id]: popup });
  const updateStyle = <K extends keyof PopupStyle>(key: K, value: PopupStyle[K]) => {
    if (!editingPopup) return;
    update({ ...editingPopup, style: { ...editingPopup.style, [key]: value } });
  };
  const remove = (id: string) => {
    const next = { ...popups };
    delete next[id];
    onChange(next);
  };
  return (
    <div className="border-border bg-card border-b px-4 py-2 text-sm" data-popup-editor-manager>
      <div className="flex flex-wrap items-center gap-2">
        {editingPopup && onBackToPage ? <Button variant="outline" size="sm" onClick={onBackToPage} aria-label="Back to Page"><ArrowLeft className="size-4" /> Back to Page</Button> : null}
        <Button variant="outline" size="sm" onClick={() => setOpen((value) => !value)} aria-expanded={open}>Popups ({entries.length})</Button>
        <Button variant="outline" size="sm" onClick={create}>Add popup</Button>
        {editingPopup ? <span className="text-foreground font-medium">Editing Popup: {editingPopup.name}</span> : <span className="text-muted-foreground">Draft-only definitions; runtime triggers are not enabled yet.</span>}
      </div>
      {editingPopup && <PopupFrameSettings popup={editingPopup} onChange={updateStyle} />}
      {open && entries.length > 0 && (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {entries.map((popup) => (
            <div key={popup.id} className={`border-border rounded-md border p-2 ${editingPopupId === popup.id ? "ring-tag-violet-fg ring-2" : ""}`}>
              <label className="block text-xs font-medium">Name
                <input aria-label="Name" className="border-input bg-background mt-1 w-full rounded border px-2 py-1" value={popup.name} onChange={(event) => update({ ...popup, name: event.target.value })} />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="text-muted-foreground">ID: {popup.id}</span>
                {onEdit && <Button variant="ghost" size="sm" onClick={() => onEdit(popup.id)}><Edit3 className="size-3.5" /> Edit Popup</Button>}
                {onPreview && <Button variant="ghost" size="sm" onClick={() => onPreview(popup.id)}><Eye className="size-3.5" /> Preview</Button>}
                <Button variant="ghost" size="sm" onClick={() => remove(popup.id)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PopupFrameSettings({ popup, onChange }: { popup: PopupDefinition; onChange: <K extends keyof PopupStyle>(key: K, value: PopupStyle[K]) => void }) {
  const style = popup.style;
  return (
    <div className="border-border bg-background mt-2 grid gap-2 rounded-md border p-3 text-xs md:grid-cols-4" aria-label="Popup frame settings">
      <label>Overlay color<input aria-label="Overlay color" type="color" className="mt-1 block h-8 w-full" value={style.overlayColor} onChange={(e) => onChange("overlayColor", e.target.value)} /></label>
      <label>Overlay opacity<input aria-label="Overlay opacity" type="number" min="0" max="1" step="0.05" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.overlayOpacity} onChange={(e) => onChange("overlayOpacity", Number(e.target.value))} /></label>
      <label>Blur (px)<input aria-label="Overlay blur" type="number" min="0" max="24" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.blurPx} onChange={(e) => onChange("blurPx", Number(e.target.value))} /></label>
      <label>Panel width<input aria-label="Panel width" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelWidth} onChange={(e) => onChange("panelWidth", e.target.value)} /></label>
      <label>Max width (px)<input aria-label="Panel max width" type="number" min="240" max="1400" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelMaxWidth} onChange={(e) => onChange("panelMaxWidth", Number(e.target.value))} /></label>
      <label>Panel background<input aria-label="Panel background" type="color" className="mt-1 block h-8 w-full" value={style.panelBackground} onChange={(e) => onChange("panelBackground", e.target.value)} /></label>
      <label>Radius (px)<input aria-label="Panel radius" type="number" min="0" max="64" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelBorderRadius} onChange={(e) => onChange("panelBorderRadius", Number(e.target.value))} /></label>
      <label>Padding (px)<input aria-label="Panel padding" type="number" min="0" max="96" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelPadding} onChange={(e) => onChange("panelPadding", Number(e.target.value))} /></label>
      <PopupSelect label="Horizontal alignment" ariaLabel="Panel alignment" value={style.panelAlignment} options={["left", "center", "right"]} onChange={(value) => onChange("panelAlignment", value as PopupStyle["panelAlignment"])} />
      <PopupSelect label="Vertical placement" ariaLabel="Panel placement" value={style.panelPlacement} options={["top", "center", "bottom"]} onChange={(value) => onChange("panelPlacement", value as PopupStyle["panelPlacement"])} />
      <PopupSelect label="Close placement" ariaLabel="Close placement" value={style.closePlacement} options={["inside", "outside"]} onChange={(value) => onChange("closePlacement", value as PopupStyle["closePlacement"])} />
      <label>Border<input aria-label="Panel border" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelBorder} onChange={(e) => onChange("panelBorder", e.target.value)} /></label>
      <label>Shadow<input aria-label="Panel shadow" className="border-input mt-1 block w-full rounded border px-2 py-1" value={style.panelShadow} onChange={(e) => onChange("panelShadow", e.target.value)} /></label>
      <label className="flex items-center gap-2 self-end"><input aria-label="Close on overlay click" type="checkbox" checked={style.closeOnOverlayClick} onChange={(e) => onChange("closeOnOverlayClick", e.target.checked)} /> Close on overlay click</label>
    </div>
  );
}

function PopupSelect({ label, ariaLabel, value, options, onChange }: { label: string; ariaLabel: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label>{label}
      <Select value={value} onValueChange={(next) => next && onChange(next)} items={Object.fromEntries(options.map((option) => [option, option]))}>
        <SelectTrigger aria-label={ariaLabel} className="mt-1"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </label>
  );
}
