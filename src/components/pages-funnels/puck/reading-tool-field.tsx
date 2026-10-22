"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings2, Share2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOptionalSubAccount } from "@/context/sub-account-context";

interface EmbedOption {
  id: string;
  name: string;
  status: "draft" | "live" | "archived";
}

function optionLabel(e: EmbedOption): string {
  return e.status === "live" ? e.name : `${e.name} (${e.status === "draft" ? "Draft" : "Archived"})`;
}

/**
 * "Choose Embed" — the Public Reading Tool block's selector (Pages &
 * Funnels → Business → Public Reading Tool). Lists this sub-account's saved
 * Embeds by name; the stored prop is the Embed id.
 */
export function ReadingToolFieldEditor({ value, onChange }: { value: string | undefined; onChange: (value: string) => void }) {
  const sub = useOptionalSubAccount();
  const [embeds, setEmbeds] = useState<EmbedOption[] | null>(null);

  useEffect(() => {
    if (!sub?.subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${sub.subAccountId}/energetic-decoder/embeds`)
      .then((r) => r.json())
      .then((d) => !cancelled && setEmbeds(((d.embeds ?? []) as EmbedOption[]).filter((e) => e.status !== "archived" || e.id === value)))
      .catch(() => !cancelled && setEmbeds([]));
    return () => {
      cancelled = true;
    };
  }, [sub?.subAccountId, value]);

  const embedsHref = sub ? `${sub.saPath("/energetic-decoder")}?tab=embeds` : "#";

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Choose Reading Tool</Label>
      {!sub ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">Reading Tools aren&apos;t available in this preview context.</p>
      ) : embeds === null ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Reading Tools…
        </div>
      ) : embeds.length === 0 ? (
        <div className="border-border bg-muted/40 flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
          <p className="text-muted-foreground text-xs">No Reading Tools yet</p>
          <a href={embedsHref} target="_blank" rel="noreferrer" className="text-primary flex items-center gap-1 text-xs font-medium hover:underline">
            <Share2 className="h-3.5 w-3.5" /> Create a Reading Tool
          </a>
        </div>
      ) : (
        <>
          <Select value={value || null} onValueChange={(v) => onChange(v ?? "")} items={Object.fromEntries(embeds.map((e) => [e.id, optionLabel(e)]))}>
            <SelectTrigger aria-label="Reading Tool">
              <SelectValue placeholder="Select a Reading Tool…" />
            </SelectTrigger>
            <SelectContent>
              {embeds.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {optionLabel(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <a href={embedsHref} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
            <Settings2 className="h-3 w-3" /> Manage Reading Tools
          </a>
        </>
      )}
    </div>
  );
}
