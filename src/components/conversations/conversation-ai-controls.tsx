"use client";

import { Bot, Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toDate } from "@/lib/format";
import {
  resumeBot,
  setConversationBotMode,
} from "@/lib/firestore/conversations";
import { cn } from "@/lib/utils";
import type {
  ConversationBotMode,
  ConversationDoc,
} from "@/types/conversations";

const MODES: { value: ConversationBotMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto", hint: "Bot replies automatically" },
  { value: "suggest", label: "Suggest", hint: "Bot drafts; you approve" },
  { value: "off", label: "Off", hint: "Bot stays silent here" },
];

/**
 * Per-conversation AI controls shown under the inbox detail header: the mode
 * toggle (Auto / Suggest / Off) plus a "bot paused" indicator + Resume when a
 * human took over recently.
 */
interface AiControlsProps {
  conversation: ConversationDoc;
  available?: boolean;
  unavailableReason?: string;
}

export function ConversationAiControls(props: AiControlsProps) {
  return (
    <AiControls
      key={`${props.conversation.subAccountId}:${props.conversation.contactId}`}
      {...props}
    />
  );
}

function AiControls({
  conversation,
  available = false,
  unavailableReason,
}: AiControlsProps) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const reason =
    unavailableReason ||
    "AI replies are unavailable until availability is checked.";
  async function update(action: "resume" | ConversationBotMode) {
    if (inFlight.current || (!available && action !== "off")) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (action === "resume") await resumeBot(conversation.contactId);
      else await setConversationBotMode(conversation.contactId, action);
    } catch (error) {
      if (active.current)
        toast.error(
          error instanceof Error
            ? error.message
            : action === "resume"
              ? "Couldn't resume AI replies."
              : "Couldn't change AI reply mode."
        );
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  const mode = conversation.botMode ?? "auto";
  const pausedUntil = toDate(conversation.botPausedUntil);
  const paused =
    mode !== "off" && !!pausedUntil && pausedUntil.getTime() > Date.now();

  return (
    <div className="bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <div className="flex items-center gap-2">
        <Bot className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground text-[11px] font-medium">
          AI replies
        </span>
        <div className="bg-background flex gap-0.5 rounded-md border p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              title={!available && m.value !== "off" ? reason : m.hint}
              aria-pressed={mode === m.value}
              disabled={busy || (!available && m.value !== "off")}
              onClick={() => update(m.value)}
              className={cn(
                "min-h-11 rounded px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                mode === m.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {paused && (
        <button
          type="button"
          onClick={() => update("resume")}
          disabled={busy || !available}
          title={!available ? reason : "Resume AI replies"}
          className="bg-primary/10 text-primary hover:bg-primary/20 flex min-h-11 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pause className="h-3 w-3" />
          Bot paused — Resume
        </button>
      )}
      {!available && (
        <p role="status" className="text-muted-foreground w-full text-xs">
          {reason}
        </p>
      )}
    </div>
  );
}
