"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { subscribeToNotes } from "@/lib/firestore/contacts";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageDoc } from "@/types/messages";
import type { ConversationChannel } from "@/types/conversations";
import type { ConversationTheme } from "@/hooks/use-conversation-theme";
import type { Note } from "@/types/contacts";

type ChannelMessage = MessageDoc & { channel: ConversationChannel };
// A view-only discriminator; notes retain their existing stored schema.
type TimelineEntry = ChannelMessage | (Note & { channel: "note" });

const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  email: "Email",
};

const CHANNEL_CHIP: Record<ConversationChannel, string> = {
  sms: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  messenger: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  instagram: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  email: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
};

/** Meta rows carry their own channel discriminator on the doc. */
type MetaMessageDoc = MessageDoc & { channel?: ConversationChannel };

const SOURCES = [
  { collection: "messages", channel: "sms", label: "SMS messages" },
  { collection: "whatsappMessages", channel: "whatsapp", label: "WhatsApp messages" },
  {
    collection: "metaMessages",
    channel: "messenger",
    label: "Messenger / Instagram messages",
  },
  { collection: "emailMessages", channel: "email", label: "Email messages" },
  { collection: "notes", channel: "note", label: "internal notes" },
] as const;

type SourceState = {
  messages: TimelineEntry[];
  ready: boolean;
  failed: boolean;
};

/**
 * The merged conversation timeline. Subscribes to the contact's SMS
 * (`messages`), WhatsApp (`whatsappMessages`), and BETA Meta (`metaMessages`,
 * Messenger + Instagram), email (`emailMessages`), and existing internal notes.
 * Renders one time-ordered stream without moving data or changing permissions.
 */
export function ConversationThread({
  contactId,
  theme = "standard",
}: {
  contactId: string;
  theme?: ConversationTheme;
}) {
  // Remount before rendering a different contact, not after an effect resets it.
  return <ContactThread key={contactId} contactId={contactId} theme={theme} />;
}

function ContactThread({
  contactId,
  theme,
}: {
  contactId: string;
  theme: ConversationTheme;
}) {
  const [sources, setSources] = useState<SourceState[]>(() =>
    SOURCES.map(() => ({ messages: [], ready: false, failed: false }))
  );
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);

  useEffect(() => {
    if (!contactId) return;
    let active = true;
    const unsubscribes = SOURCES.map((source, index) => {
      const update = (value: SourceState) => {
        if (!active) return;
        setSources((previous) =>
          previous.map((item, i) => (i === index ? value : item))
        );
      };
      const onError = () => update({ messages: [], ready: true, failed: true });
      if (source.collection === "notes") {
        // Existing contact-scoped reader: no new model, query scope, or writes.
        return safeSubscribe(
          () => subscribeToNotes(contactId, (notes) => update({
            messages: notes.map((note) => ({ ...note, channel: "note" as const })),
            ready: true,
            failed: false,
          }), onError),
          onError
        );
      }
      return safeSubscribe(
        () =>
          onSnapshot(
            query(
              collection(
                getFirebaseDb(),
                "contacts",
                contactId,
                source.collection
              ),
              orderBy("createdAt", "asc")
            ),
            (snap) =>
              update({
                messages: snap.docs.map((doc) => {
                  const message = {
                    ...doc.data(),
                    id: doc.id,
                  } as MetaMessageDoc;
                  return {
                    ...message,
                    channel:
                      source.collection === "metaMessages" &&
                      message.channel === "instagram"
                        ? "instagram"
                        : source.channel,
                  };
                }),
                ready: true,
                failed: false,
              }),
            onError
          ),
        onError
      );
    });
    return () => {
      active = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [contactId]);

  const merged = useMemo(
    () =>
      sources
        .flatMap((source) => source.messages)
        .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt)),
    [sources]
  );
  const hydrated = sources.every((source) => source.ready);
  const failedSources = SOURCES.filter((_, index) => sources[index].failed);

  useEffect(() => {
    if (scrollerRef.current && followLatestRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [merged, hydrated]);

  return (
    <div
      ref={scrollerRef}
      aria-label="Conversation messages"
      onScroll={(event) => {
        const element = event.currentTarget;
        followLatestRef.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
      className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-violet-50/30 px-4 py-6 sm:px-6 dark:bg-violet-950/10"
    >
      {failedSources.length > 0 && (
        <p
          role="status"
          className="border-destructive/30 bg-background text-destructive rounded-xl border px-4 py-3 text-sm"
        >
          Could not load{" "}
          {failedSources.map((source) => source.label).join(", ")}.
          Switch away and back to retry.
        </p>
      )}
      {!contactId ? (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Select a contact to view their conversation.
        </p>
      ) : !hydrated && merged.length === 0 ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Loading messages and notes…</span>
          <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-violet-100 dark:bg-violet-950" />
          <div className="ml-auto h-16 w-3/4 animate-pulse rounded-2xl bg-violet-200 dark:bg-violet-900" />
        </div>
      ) : merged.length === 0 ? (
        <div className="flex h-full min-h-[150px] items-center justify-center text-center">
          <p className="text-muted-foreground text-sm">
            {failedSources.length
              ? "Conversation history is unavailable for the sources listed above."
              : "No messages or notes yet. Reply below to start the conversation."}
          </p>
        </div>
      ) : (
        merged.map((m, index) => (
          <Fragment key={`${m.channel}:${m.id}`}>
            {(index === 0 ||
              dayLabel(m.createdAt) !==
                dayLabel(merged[index - 1].createdAt)) && (
              <div className="flex items-center gap-3 py-3">
                <div className="bg-border h-px flex-1" />
                <p className="bg-background text-muted-foreground rounded-full border px-3 py-1 text-xs font-medium">
                  {dayLabel(m.createdAt)}
                </p>
                <div className="bg-border h-px flex-1" />
              </div>
            )}
            {m.channel === "note" ? <InternalNote note={m} /> : <ChannelBubble message={m} theme={theme} />}
          </Fragment>
        ))
      )}
      {contactId && !hydrated && merged.length > 0 && (
        <p role="status" className="text-muted-foreground text-center text-xs">
          Loading remaining messages and notes…
        </p>
      )}
    </div>
  );
}

function InternalNote({ note }: { note: Note }) {
  const ts = messageDate(note.createdAt);
  return (
    <div className="mx-auto w-full max-w-[92%] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold">Internal note</span>
        <time dateTime={ts?.toISOString()} title={ts?.toLocaleString()}>
          {ts ? ts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "Time unavailable"}
        </time>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed [overflow-wrap:anywhere]">{note.content}</p>
    </div>
  );
}

/** Bubble color classes per (theme, channel, direction). */
function bubbleClasses(
  channel: ConversationChannel,
  isOutbound: boolean,
  theme: ConversationTheme
): string {
  if (theme === "native") {
    if (channel === "whatsapp") {
      return isOutbound
        ? "rounded-br-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-white"
        : "rounded-bl-sm bg-white text-[#111b21] ring-1 ring-black/5 dark:bg-[#202c33] dark:text-[#e9edef] dark:ring-0";
    }
    if (channel === "messenger") {
      // Messenger → blue outbound bubble
      return isOutbound
        ? "rounded-br-sm bg-[#0084ff] text-white"
        : "rounded-bl-sm bg-[#e9e9eb] text-black dark:bg-[#3b3b3d] dark:text-white";
    }
    if (channel === "instagram") {
      // Instagram → purple/gradient outbound bubble
      return isOutbound
        ? "rounded-br-sm bg-gradient-to-br from-[#a033ff] via-[#ff5280] to-[#ff7061] text-white"
        : "rounded-bl-sm bg-[#efefef] text-black dark:bg-[#3b3b3d] dark:text-white";
    }
    if (channel === "email") {
      // Letter-like, not a chat-bubble color — inbound only today.
      return "rounded-bl-sm bg-white text-[#111b21] ring-1 ring-black/5 dark:bg-[#202c33] dark:text-[#e9edef] dark:ring-0";
    }
    // SMS → iMessage palette
    return isOutbound
      ? "rounded-br-sm bg-[#007aff] text-white"
      : "rounded-bl-sm bg-[#e9e9eb] text-black dark:bg-[#3b3b3d] dark:text-white";
  }
  // Standard / brand
  return isOutbound
    ? "bg-violet-700 text-white dark:bg-violet-600"
    : "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100";
}

function ChannelBubble({
  message,
  theme,
}: {
  message: ChannelMessage;
  theme: ConversationTheme;
}) {
  const isOutbound = message.direction === "outbound";
  const ts = messageDate(message.createdAt);
  const channelLabel = CHANNEL_LABEL[message.channel] ?? message.channel;

  const isEmail = message.channel === "email";

  return (
    <div
      className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "min-w-0 rounded-2xl px-4 py-3 text-sm leading-relaxed [overflow-wrap:anywhere] shadow-sm",
          isEmail ? "max-w-[95%] sm:max-w-[88%]" : "max-w-[88%] sm:max-w-[78%]",
          bubbleClasses(message.channel, isOutbound, theme),
          message.status === "failed" && "ring-destructive ring-2"
        )}
      >
        {isEmail && message.subject && (
          <p className="mb-1 font-semibold">{message.subject}</p>
        )}
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
      </div>
      <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            CHANNEL_CHIP[message.channel] ?? CHANNEL_CHIP.sms
          )}
        >
          {channelLabel}
        </span>
        <span className="sr-only">{isOutbound ? "Outgoing" : "Incoming"}</span>
        <time dateTime={ts?.toISOString()} title={ts?.toLocaleString()}>
          {ts
            ? ts.toLocaleString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })
            : "Time unavailable"}
        </time>
        {isOutbound && message.status === "queued" && <span>· Queued</span>}
        {message.status === "failed" && (
          <span className="text-destructive font-medium">· Failed to send</span>
        )}
      </div>
    </div>
  );
}

function messageDate(value: MessageDoc["createdAt"]): Date | null {
  const date = toDate(value);
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function dayLabel(value: MessageDoc["createdAt"]): string {
  return (
    messageDate(value)?.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }) ?? "Date unavailable"
  );
}

function toMillis(value: MessageDoc["createdAt"]): number {
  return messageDate(value)?.getTime() ?? 0;
}
