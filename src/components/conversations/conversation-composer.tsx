"use client";

import { useId, useRef, useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GoogleGIcon } from "@/components/brand/google-g-icon";
import { AddNoteInput } from "@/components/contacts/add-note-input";
import { cn } from "@/lib/utils";
import { DEFAULT_REVIEW_SMS_TEMPLATE } from "@/lib/reviews/constants";
import type { Contact } from "@/types/contacts";
import type { ConversationChannel } from "@/types/conversations";

const LABEL: Record<ConversationChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  email: "Email",
};

/**
 * Channel-aware reply box. Posts to the EXISTING send routes
 * (/api/comms/sms/send, /api/comms/whatsapp/send, /api/comms/email/send) —
 * the snapshot listener in ConversationThread surfaces the new row.
 * Defaults to the channel the contact last used; the operator can switch
 * when more than one is available.
 */
export interface ConversationComposerProps {
  contact: Contact;
  availability: {
    channel: ConversationChannel;
    available: boolean;
    reason?: string;
    notice?: string;
  }[];
  defaultChannel: ConversationChannel;
  onSent?: () => void;
  loading?: boolean;
}

export function ConversationComposer(props: ConversationComposerProps) {
  const { subAccountId } = useSubAccount();
  return <Composer key={`${subAccountId}:${props.contact.id}`} {...props} />;
}

function Composer({
  contact,
  availability,
  defaultChannel,
  onSent,
  loading = false,
}: ConversationComposerProps) {
  const { subAccount, saPath } = useSubAccount();
  const id = useId();
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [channel, setChannel] = useState<ConversationChannel>(defaultChannel);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  // "Ask for review" — only when a review link is configured. Inserts the
  // rendered review message into the composer (free-form) so the operator can
  // tweak it and send on the current channel. For WhatsApp this works WITHOUT an
  // approved template because the customer's recent inbound keeps the 24h window
  // open (the send route 409s if it has closed).
  const reviewCfg = subAccount?.googleReviewConfig ?? null;
  const reviewConfigured = !!reviewCfg?.reviewUrl;

  function insertReviewMessage() {
    if (!reviewCfg?.reviewUrl) return;
    const firstName = (contact.name ?? "").trim().split(/\s+/)[0] ?? "";
    const msg = (reviewCfg.messageTemplate || DEFAULT_REVIEW_SMS_TEMPLATE)
      .replace(/\{\{\s*firstName\s*\}\}/g, firstName)
      .replace(/\{\{\s*businessName\s*\}\}/g, subAccount?.name ?? "")
      .replace(/\{\{\s*reviewUrl\s*\}\}/g, reviewCfg.reviewUrl);
    // Preserve anything the operator already typed (e.g. a thank-you).
    setBody((prev) => (prev.trim() ? `${prev.trim()} ${msg}` : msg));
  }

  // Meta (Messenger / Instagram) replies post to a different route, identify
  // the recipient by `metaUserId` (not phone), and have no STOP-style opt-out.
  const isMeta = channel === "messenger" || channel === "instagram";
  const optedOut = isMeta
    ? false
    : channel === "sms"
      ? !!contact.smsOptedOut
      : channel === "whatsapp"
        ? !!contact.whatsappOptedOut
        : false;
  const endpoint = isMeta
    ? "/api/comms/meta/send"
    : channel === "sms"
      ? "/api/comms/sms/send"
      : channel === "email"
        ? "/api/comms/email/send"
        : "/api/comms/whatsapp/send";
  const hasIdentity = isMeta
    ? !!contact.metaUserId
    : channel === "email"
      ? !!contact.email
      : !!contact.phone;
  function channelReason(ch: ConversationChannel) {
    const capability = availability.find((item) => item.channel === ch);
    if (loading) return "Checking channel availability…";
    if (
      (ch === "sms" && contact.smsOptedOut) ||
      (ch === "whatsapp" && contact.whatsappOptedOut)
    )
      return `Contact opted out of ${LABEL[ch]}.`;
    if (
      ch === "email"
        ? !contact.email
        : ch === "sms" || ch === "whatsapp"
          ? !contact.phone
          : !contact.metaUserId
    )
      return `No ${ch === "email" ? "email address" : ch === "sms" || ch === "whatsapp" ? "phone number" : `${LABEL[ch]} identity`} for this contact.`;
    return capability?.available
      ? undefined
      : capability?.reason || `${LABEL[ch]} is unavailable.`;
  }
  const reason = channelReason(channel);
  const notice = availability.find((item) => item.channel === channel)?.notice;
  const disabled = !!reason || optedOut || sending || !hasIdentity;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled || tab !== "reply" || inFlight.current) return;
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!hasIdentity) {
      toast.error(
        isMeta
          ? "This contact hasn't messaged via Facebook/Instagram."
          : channel === "email"
            ? "This contact has no email address."
            : "This contact has no phone number."
      );
      return;
    }
    if (optedOut) {
      toast.error(`This contact opted out of ${LABEL[channel]}.`);
      return;
    }
    inFlight.current = true;
    setSending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          body: trimmed,
          ...(isMeta ? { channel } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't send.");
      }
      if (!active.current) return;
      setBody("");
      onSent?.();
      // Snapshot listener appends the row.
    } catch (err) {
      if (active.current)
        toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      inFlight.current = false;
      if (active.current) setSending(false);
    }
  }

  return (
    <div className="bg-card border-t px-4 py-3">
      <div className="mb-3 flex gap-1" aria-label="Message type">
        {(["reply", "note"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "focus-visible:outline-primary min-h-11 rounded-md px-3 text-sm font-medium",
              tab === value
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            {value === "reply" ? "Reply" : "Internal Note"}
          </button>
        ))}
      </div>
      <div hidden={tab !== "note"} className="[&_button]:min-h-11">
        <p className="text-muted-foreground mb-2 text-xs">
          Internal notes are saved to this contact and are never sent.
        </p>
        <AddNoteInput contactId={contact.id} />
      </div>
      <form hidden={tab !== "reply"} onSubmit={handleSubmit}>
        <Textarea
          value={body}
          aria-label={`Reply via ${LABEL[channel]}`}
          aria-describedby={reason || notice ? `${id}-status` : undefined}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            optedOut
              ? `Contact opted out of ${LABEL[channel]}`
              : `Reply via ${LABEL[channel]} to ${
                  (isMeta
                    ? contact.name
                    : channel === "email"
                      ? contact.email
                      : contact.phone) || "this contact"
                }…`
          }
          rows={2}
          disabled={disabled}
          className="min-h-24 resize-none px-3 py-2 text-sm"
        />
        {(reason || notice) && (
          <p
            id={`${id}-status`}
            role="status"
            className="text-muted-foreground mt-2 text-xs"
          >
            {reason || notice}
          </p>
        )}
        {channel === "whatsapp" && reason && (
          <Link
            href={saPath(`/contacts/${contact.id}`)}
            className="text-primary inline-flex min-h-11 items-center text-xs underline"
          >
            View contact for WhatsApp templates
          </Link>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {reviewConfigured ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={insertReviewMessage}
              disabled={sending}
              title="Insert a Google review request into the reply"
            >
              <GoogleGIcon className="mr-1 h-3.5 w-3.5" />
              Ask for review
            </Button>
          ) : (
            <span />
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label
              htmlFor={`${id}-channel`}
              className="text-muted-foreground text-xs"
            >
              Send via
            </label>
            <select
              id={`${id}-channel`}
              value={channel}
              disabled={sending || loading}
              onChange={(e) =>
                setChannel(e.target.value as ConversationChannel)
              }
              className="bg-background focus-visible:outline-primary min-h-11 max-w-full rounded-md border px-2 text-sm sm:max-w-64"
            >
              {(Object.keys(LABEL) as ConversationChannel[]).map((ch) => {
                const unavailable = channelReason(ch);
                return (
                  <option key={ch} value={ch} disabled={!!unavailable}>
                    {LABEL[ch]}
                    {unavailable ? ` — ${unavailable}` : ""}
                  </option>
                );
              })}
            </select>
            <Button
              type="submit"
              size="sm"
              className="min-h-11"
              disabled={!body.trim() || disabled}
            >
              {sending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
