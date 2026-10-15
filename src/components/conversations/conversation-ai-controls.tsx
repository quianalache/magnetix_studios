"use client";

import { AlertCircle, Bot, ChevronDown, Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toDate } from "@/lib/format";
import {
  resumeBot,
  setConversationBotMode,
} from "@/lib/firestore/conversations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
 * Per-conversation AI replies control (approved Wave 3 layout): a compact
 * "AI replies: Auto ▾" button in the thread header. The dropdown holds the
 * same mode choice (Auto / Suggest / Off), the "bot paused — Resume" action
 * when a human took over recently, and — only when AI isn't available for
 * this conversation — the reason. Same writes and gating as before.
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
  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? "Auto";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={`AI replies: ${modeLabel}${paused ? " (paused)" : ""}${available ? "" : " — unavailable"}`}
            title={available ? "AI replies for this conversation" : reason}
            className="h-8 gap-1.5 px-2 text-caption font-medium @lg/convo:px-2.5"
          />
        }
      >
        <Bot className="size-3.5 text-link" aria-hidden="true" />
        <span className="hidden text-muted-foreground @lg/convo:inline">AI replies:</span>
        <span className="text-foreground">{modeLabel}</span>
        {paused && (
          <span className="rounded-chip bg-status-warning-bg px-1.5 text-micro font-semibold text-status-warning-fg">
            Paused
          </span>
        )}
        {!available && (
          <AlertCircle className="hidden size-3.5 text-ink-tertiary @md/convo:block" aria-hidden="true" />
        )}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {!available && (
          <p
            role="status"
            className="mx-1 mt-1 mb-1.5 rounded-md bg-surface-sunken px-2 py-1.5 text-caption text-muted-foreground"
          >
            {reason}
          </p>
        )}
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => void update(next as ConversationBotMode)}
        >
          {MODES.map((m) => (
            <DropdownMenuRadioItem
              key={m.value}
              value={m.value}
              disabled={busy || (!available && m.value !== "off")}
              className="items-start py-1.5"
            >
              <span className="flex flex-col">
                <span className="font-medium">{m.label}</span>
                <span className="text-caption text-muted-foreground">{m.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {paused && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={busy || !available}
              onClick={() => void update("resume")}
              className="text-status-warning-fg"
            >
              <Pause className="size-3.5" aria-hidden="true" />
              Bot paused — Resume
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
