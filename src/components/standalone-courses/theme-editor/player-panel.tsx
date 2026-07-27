"use client";

import { ColorInput } from "@/components/ui/color-input";
import type { LessonPlayerTheme } from "@/types/course-theme";

export function PlayerPanel({
  value,
  onChange,
}: {
  value: LessonPlayerTheme;
  onChange: (next: LessonPlayerTheme) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm font-medium">Lesson Player</p>
      <ColorInput
        label="Background Color"
        value={value.backgroundColor}
        onChange={(v) => onChange({ ...value, backgroundColor: v })}
      />
    </div>
  );
}
