"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateReadingResultSettings } from "@/lib/firestore/pages-funnels";
import { READING_SAMPLE_KINDS, READING_SAMPLE_LABEL, type ReadingResultPageSettings, type ReadingSampleKind } from "@/types/reading-blocks";

/**
 * Reading settings for a Reading Result Page (2026-10-21) — the only two
 * page-level Reading choices: the default Chart Design for every Reading
 * block, and which sample chart the builder shows. Wording isn't here on
 * purpose: it always comes from the Reading's own saved Content Set, so this
 * page can never show text that disagrees with the person's Reading.
 */
/**
 * The page's Reading settings, provided around `<Puck>` by the editor shell.
 * The button reads them from here rather than from props so a change never
 * rebuilds Puck's `overrides` — that remounted the whole header, which
 * unmounted this button and closed its dialog the moment a choice was made.
 */
export const ReadingResultSettingsContext = createContext<{
  settings: ReadingResultPageSettings;
  onChange: (next: ReadingResultPageSettings) => void;
} | null>(null);

export function ReadingResultSettingsButton({ subAccountId, pageId }: { subAccountId: string; pageId: string }) {
  const ctx = useContext(ReadingResultSettingsContext);
  const [open, setOpen] = useState(false);
  const [designs, setDesigns] = useState<{ id: string; name: string }[] | null>(null);
  useEffect(() => {
    if (!open || designs) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-design-sets`)
      .then((r) => r.json())
      .then((d) => setDesigns(((d.sets ?? []) as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name }))))
      .catch(() => setDesigns([]));
  }, [open, designs, subAccountId]);

  if (!ctx) return null;
  const { settings, onChange } = ctx;

  async function save(next: ReadingResultPageSettings) {
    onChange(next);
    try {
      await updateReadingResultSettings(pageId, next);
    } catch {
      toast.error("Couldn’t save Reading settings.");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Reading settings" title="Reading settings">
        <Sparkles className="h-4 w-4" />
        <span className="hidden xl:inline">Reading settings</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reading settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Chart Design</Label>
              <Select
                value={settings.chartDesignSetId ?? "__inherit"}
                onValueChange={(v) => v && save({ ...settings, chartDesignSetId: v === "__inherit" ? null : v })}
                items={{ __inherit: "Use the Reading Tool’s design", ...Object.fromEntries((designs ?? []).map((d) => [d.id, d.name])) }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit">Use the Reading Tool’s design</SelectItem>
                  {(designs ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Colors for every chart on this page. “Use the Reading Tool’s design” follows the Reading Tool that sent them here, then your default.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Sample chart while you design</Label>
              <Select
                value={settings.sample}
                onValueChange={(v) => v && save({ ...settings, sample: v as ReadingSampleKind })}
                items={Object.fromEntries(READING_SAMPLE_KINDS.map((k) => [k, READING_SAMPLE_LABEL[k]]))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {READING_SAMPLE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {READING_SAMPLE_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted-foreground">
                Only for designing — fictional charts, never saved. Visitors always see their own Reading.
              </p>
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-caption text-muted-foreground">
              The Reading’s words come from the Content Set chosen on the Reading Tool and saved with each Reading — so this page always matches
              what the person sees in MyMagnetix.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
