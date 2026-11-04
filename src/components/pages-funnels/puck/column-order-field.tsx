"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ColumnOrderConfig } from "@/lib/pages-funnels/puck/column-order";

const DEVICES = [
  { key: "desktop", label: "Desktop", icon: Monitor },
  { key: "tablet", label: "Tablet", icon: Tablet },
  { key: "mobile", label: "Mobile", icon: Smartphone },
] as const;

/**
 * Row → Column order (Wave 3): reverse the columns on any device. Mobile is
 * the common case (show the image above the text when the columns stack).
 */
export function ColumnOrderFieldEditor({ value, onChange }: { value: ColumnOrderConfig | undefined; onChange: (v: ColumnOrderConfig) => void }) {
  const current = value ?? {};
  return (
    <div className="space-y-2" data-column-order-field="">
      <Label className="text-xs font-semibold">Column order</Label>
      <div className="border-border divide-border divide-y rounded-lg border">
        {DEVICES.map(({ key, label, icon: Icon }) => {
          const id = `column-order-${key}`;
          return (
            <div key={key} className="flex items-center justify-between gap-3 px-3 py-2">
              <Label htmlFor={id} className="flex items-center gap-2 text-xs font-medium">
                <Icon className="text-muted-foreground h-3.5 w-3.5" aria-hidden />
                Reverse on {label.toLowerCase()}
              </Label>
              <Switch
                id={id}
                checked={current[key] === true}
                onCheckedChange={(checked) => {
                  const next: ColumnOrderConfig = { ...current };
                  if (checked) next[key] = true;
                  else delete next[key];
                  onChange(next);
                }}
              />
            </div>
          );
        })}
      </div>
      <p className="text-muted-foreground text-caption">Shows this row&apos;s columns in reverse order on that device — for example, the image above the text on phones.</p>
    </div>
  );
}
