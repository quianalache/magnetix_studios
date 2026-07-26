"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorInput } from "@/components/ui/color-input";
import type { HeaderTheme } from "@/types/course-theme";

export function HeaderPanel({
  value,
  onChange,
}: {
  value: HeaderTheme;
  onChange: (next: HeaderTheme) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Background"
          value={value.background}
          onChange={(v) => onChange({ ...value, background: v })}
        />
        <ColorInput
          label="Icon Color"
          value={value.iconColor}
          onChange={(v) => onChange({ ...value, iconColor: v })}
        />
      </div>
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Search Background"
          value={value.searchBackground}
          onChange={(v) => onChange({ ...value, searchBackground: v })}
        />
        <ColorInput
          label="Search Border"
          value={value.searchBorder}
          onChange={(v) => onChange({ ...value, searchBorder: v })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Search Placeholder</Label>
        <Input
          value={value.searchPlaceholder}
          onChange={(e) => onChange({ ...value, searchPlaceholder: e.target.value })}
        />
      </div>
    </div>
  );
}
