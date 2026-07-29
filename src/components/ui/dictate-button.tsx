"use client";

import { useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { useDictation } from "@/hooks/use-dictation";
import { cn } from "@/lib/utils";

/**
 * Speech-to-text button for a plain controlled textarea/input. Renders
 * nothing when the browser doesn't support the Web Speech API (Firefox) —
 * callers don't need their own feature-detection.
 *
 * Appends recognized speech to whatever's already in the field rather than
 * replacing it — `value` is snapshotted the moment dictation starts so
 * typing beforehand is preserved, then each finalized phrase (most engines
 * finalize every few seconds while you keep talking) gets appended live.
 */
export function DictateButton({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
}) {
  const baseRef = useRef("");
  const finalizedRef = useRef("");

  const { supported, listening, toggle, error } = useDictation(
    (transcript, isFinal) => {
      if (isFinal) {
        finalizedRef.current = joinText(finalizedRef.current, transcript);
        onChange(joinText(baseRef.current, finalizedRef.current));
      } else {
        onChange(
          joinText(baseRef.current, joinText(finalizedRef.current, transcript)),
        );
      }
    },
  );

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  if (!supported) return null;

  function handleClick() {
    if (!listening) {
      baseRef.current = value;
      finalizedRef.current = "";
    }
    toggle();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={listening ? "Stop dictation" : "Dictate"}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
        listening
          ? "text-destructive"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Mic className={cn("h-4 w-4", listening && "animate-pulse")} />
    </button>
  );
}

function joinText(base: string, addition: string): string {
  const trimmedAddition = addition.trim();
  if (!trimmedAddition) return base;
  const trimmedBase = base.trim();
  return trimmedBase ? `${trimmedBase} ${trimmedAddition}` : trimmedAddition;
}
