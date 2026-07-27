"use client";

import { ColorInput } from "@/components/ui/color-input";
import type { LessonBreadcrumbTheme } from "@/types/course-theme";

const RADIO = "flex items-center gap-1.5 text-xs";

export function BreadcrumbPanel({
  value,
  onChange,
}: {
  value: LessonBreadcrumbTheme;
  onChange: (next: LessonBreadcrumbTheme) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Breadcrumb visibility</p>
        <div className="flex gap-3">
          <label className={RADIO}>
            <input
              type="radio"
              checked={value.visible}
              onChange={() => onChange({ ...value, visible: true })}
              className="h-3.5 w-3.5"
            />
            Show
          </label>
          <label className={RADIO}>
            <input
              type="radio"
              checked={!value.visible}
              onChange={() => onChange({ ...value, visible: false })}
              className="h-3.5 w-3.5"
            />
            Hide
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <ColorInput
          label="Breadcrumb Color"
          value={value.color}
          onChange={(v) => onChange({ ...value, color: v })}
        />
        <ColorInput
          label="Breadcrumb Active Color"
          value={value.activeColor}
          onChange={(v) => onChange({ ...value, activeColor: v })}
        />
      </div>
    </div>
  );
}
