"use client";

import { useEffect, useId, useState } from "react";
import { FieldLabel } from "@puckeditor/core";
import { Hash } from "lucide-react";
import { parseMetricNumber } from "@/lib/pages-funnels/data-metrics/validation";

/**
 * Number input for Data & Metrics values. Puck's built-in number field saves
 * a cleared box as 0 and refuses keystrokes below `min` (so "0.5" can't be
 * typed), which makes "not set yet" indistinguishable from a real zero. This
 * field keeps the customer's text while they type, saves only real numbers
 * (commas allowed, e.g. 1,250), treats an empty box as "not set", and says
 * so inline when the text isn't a number.
 */
export function MetricNumberInput({
  label,
  value,
  onChange,
  hint,
  suffix,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  hint?: string;
  suffix?: string;
  placeholder?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value == null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);

  // Follow outside changes (undo/redo, reload) without fighting the typist.
  useEffect(() => {
    const current = text.trim() === "" ? undefined : parseMetricNumber(text);
    if ((current ?? undefined) !== (value ?? undefined)) {
      setText(value == null ? "" : String(value));
      setInvalid(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    // Puck's own FieldLabel (with the "#" number icon), so this field's label
    // matches every other field in the sidebar.
    <FieldLabel label={label} icon={<Hash size={16} />}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          title={label}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            if (next.trim() === "") {
              setInvalid(false);
              onChange(undefined);
              return;
            }
            const parsed = parseMetricNumber(next);
            if (parsed == null) {
              setInvalid(true);
              return;
            }
            setInvalid(false);
            onChange(parsed);
          }}
          className="border-input bg-background aria-[invalid=true]:border-destructive h-9 w-full rounded-md border px-2 text-sm tabular-nums"
        />
        {suffix ? <span className="text-muted-foreground text-sm">{suffix}</span> : null}
      </div>
      {invalid ? (
        <p id={`${id}-error`} className="text-destructive text-caption">
          Enter a number, like 1250 or 12.5.
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-caption">
          {hint}
        </p>
      ) : null}
    </FieldLabel>
  );
}
