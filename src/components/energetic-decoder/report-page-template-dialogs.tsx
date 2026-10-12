"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { REPORT_TEMPLATE_SYSTEMS, type ReportTemplatePageType, type ReportTemplateSystem } from "@/lib/energetics/report-templates";
import { MAX_TEMPLATE_NAME, savedTemplatePageTypes } from "@/lib/energetics/report-page-templates";

/**
 * Saved page templates (2026-10-12) — the three small dialogs: Save page as
 * template (name · system · page type, no style tag), Rename, and Delete
 * (library only; inserted pages stay as they are).
 */

const chip = (on: boolean) =>
  `h-[30px] rounded-full border px-3 text-[12.5px] font-semibold ${on ? "border-[#5420a8] bg-[#ede9fe] text-[#4c1d95]" : "border-[#e3ddee] bg-white text-[#3f4466] hover:border-violet-200"}`;

export function SaveTemplateDialog({
  open,
  pageTitle,
  defaultPageType,
  busy,
  onCancel,
  onSave,
}: {
  open: boolean;
  pageTitle: string;
  defaultPageType: ReportTemplatePageType;
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { name: string; system: ReportTemplateSystem; pageType: ReportTemplatePageType }) => void;
}) {
  const [name, setName] = useState(pageTitle);
  const [system, setSystem] = useState<ReportTemplateSystem>("humanDesign");
  const [pageType, setPageType] = useState<ReportTemplatePageType>(defaultPageType);
  useEffect(() => {
    if (!open) return;
    setName(pageTitle);
    setSystem("humanDesign");
    setPageType(defaultPageType);
  }, [open, pageTitle, defaultPageType]);
  const types = savedTemplatePageTypes(system);
  const systemLabel = REPORT_TEMPLATE_SYSTEMS.find((s) => s.key === system)?.label ?? "";
  const valid = name.trim().length > 0 && types.includes(pageType);
  const hint = pageType === "Other" ? `Saved to ${systemLabel} › Mine.` : `Saved to ${systemLabel} › Mine, and also listed under ${pageType}.`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-[400px]" data-save-template-dialog>
        <DialogHeader>
          <DialogTitle className="pr-6">Save page as template</DialogTitle>
          <DialogDescription>Saves a copy of this page to your Templates. Pages already in reports won&apos;t change.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) onSave({ name: name.trim(), system, pageType });
          }}
        >
          <label className="block space-y-1.5 text-[12.5px] font-semibold text-[#18204a]">
            Template name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_TEMPLATE_NAME}
              autoFocus
              className="block h-[38px] w-full rounded-[10px] border border-[#e3ddee] px-3 text-sm font-medium outline-none focus:border-violet-400"
              data-save-template-name
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-[12.5px] font-semibold text-[#18204a]">System</span>
            <div role="radiogroup" aria-label="System" className="grid grid-cols-2 gap-1 rounded-xl bg-[#f3effb] p-[3px]">
              {REPORT_TEMPLATE_SYSTEMS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="radio"
                  aria-checked={system === s.key}
                  onClick={() => {
                    setSystem(s.key);
                    if (!savedTemplatePageTypes(s.key).includes(pageType)) setPageType("Other");
                  }}
                  className={`rounded-[9px] py-2 text-[13px] font-semibold ${system === s.key ? "bg-[#5420a8] text-white" : "text-[#5b4a8a] hover:bg-white/70"}`}
                  data-save-template-system={s.key}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div role="radiogroup" aria-labelledby="save-template-type" className="space-y-1.5">
            <span id="save-template-type" className="text-[12.5px] font-semibold text-[#18204a]">
              Page type
            </span>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={pageType === t} onClick={() => setPageType(t)} className={`${chip(pageType === t)} ${t === "Other" ? "border-dashed" : ""}`} data-save-template-type={t}>
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-[#6b6f8a]" data-save-template-hint>
              {hint}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy} className="bg-[#5420a8] hover:bg-[#4c1d95]" data-save-template-submit>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameTemplateDialog({ open, currentName, busy, onCancel, onRename }: { open: boolean; currentName: string; busy: boolean; onCancel: () => void; onRename: (name: string) => void }) {
  const [name, setName] = useState(currentName);
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);
  const valid = name.trim().length > 0 && name.trim() !== currentName;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-[380px]" data-rename-template-dialog>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Only the template&apos;s name changes. Pages you already added from it keep their own titles.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) onRename(name.trim());
          }}
          className="space-y-4"
        >
          <input
            aria-label="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_TEMPLATE_NAME}
            autoFocus
            className="block h-[38px] w-full rounded-[10px] border border-[#e3ddee] px-3 text-sm font-medium outline-none focus:border-violet-400"
            data-rename-template-name
          />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || busy} className="bg-[#5420a8] hover:bg-[#4c1d95]" data-rename-template-submit>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTemplateDialog({ open, name, busy, onCancel, onDelete }: { open: boolean; name: string; busy: boolean; onCancel: () => void; onDelete: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="sm:max-w-[400px]" data-delete-template-dialog>
        <DialogHeader>
          <DialogTitle className="pr-6">Delete “{name}”?</DialogTitle>
          <DialogDescription>
            It will be removed from your Template Library. Pages you already added to reports from this template stay exactly as they are — they&apos;re independent copies.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onDelete} data-delete-template-submit>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Delete template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
