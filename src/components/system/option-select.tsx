"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Base UI Select can't hold "" — the "none" option maps through this. */
const NONE = "__none";

/**
 * OptionSelect — the system Select for the common "pick one, or none" field
 * (Unset / Unassigned / Doesn't repeat …) that used to be a native <select>
 * with an empty-string option (Wave 2). `value` / `onChange` speak `null`
 * for "none", so swapping it in never changes what a form saves.
 */
export function OptionSelect<T extends string>({
  id,
  value,
  onChange,
  options,
  noneLabel,
  disabled,
  size,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: T | null;
  onChange: (value: T | null) => void;
  /** `disabled` options stay visible but can't be picked (e.g. an unavailable channel). */
  options: readonly { value: T; label: string; disabled?: boolean }[];
  /** Label of the empty choice; omit when a value is always required. */
  noneLabel?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
  "aria-label"?: string;
}) {
  const items: Record<string, string> = {
    ...(noneLabel !== undefined ? { [NONE]: noneLabel } : {}),
    ...Object.fromEntries(options.map((o) => [o.value, o.label])),
  };
  return (
    <Select
      value={value ?? (noneLabel !== undefined ? NONE : null)}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? null : (next as T));
      }}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} aria-label={ariaLabel} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {noneLabel !== undefined ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
