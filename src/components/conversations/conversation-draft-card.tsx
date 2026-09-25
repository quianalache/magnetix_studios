"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { discardConversationDraft } from "@/lib/firestore/conversations";
import { useSubAccount } from "@/context/sub-account-context";
import { toDate } from "@/lib/format";
import type { Contact } from "@/types/contacts";
import type { ConversationDraft } from "@/types/conversations";

const LABEL = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  email: "Email",
} as const;

/**
 * Suggest-mode draft awaiting approval. The operator can edit the text, then
 * Approve & send (posts to the existing channel send route — the human-send
 * upsert clears the draft + pauses the bot server-side) or Discard.
 */
interface DraftCardProps {
  contact: Contact;
  draft: ConversationDraft;
  disabledReason?: string;
  onSent?: () => void;
}

export function ConversationDraftCard(props: DraftCardProps) {
  const { subAccountId } = useSubAccount();
  const draftKey = JSON.stringify([
    subAccountId,
    props.contact.id,
    props.draft.channel,
    props.draft.body,
    toDate(props.draft.createdAt)?.getTime(),
  ]);
  return <DraftCard key={draftKey} {...props} />;
}

function DraftCard({ contact, draft, disabledReason, onSent }: DraftCardProps) {
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<null | "approve" | "discard">(null);
  const [sent, setSent] = useState(false);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const isMeta = draft.channel === "messenger" || draft.channel === "instagram";
  const endpoint = isMeta
    ? "/api/comms/meta/send"
    : draft.channel === "sms"
      ? "/api/comms/sms/send"
      : draft.channel === "email"
        ? "/api/comms/email/send"
        : "/api/comms/whatsapp/send";
  const optedOut =
    draft.channel === "sms"
      ? contact.smsOptedOut
      : draft.channel === "whatsapp"
        ? contact.whatsappOptedOut
        : draft.channel === "email"
          ? contact.emailOptedOut
          : false;
  const hasIdentity = isMeta
    ? !!contact.metaUserId
    : draft.channel === "email"
      ? !!contact.email
      : !!contact.phone;
  const reason =
    disabledReason ||
    (optedOut
      ? `Contact opted out of ${LABEL[draft.channel]}.`
      : !hasIdentity
        ? `Contact has no recipient address for ${LABEL[draft.channel]}.`
        : undefined);

  async function approve() {
    const trimmed = body.trim();
    if (!trimmed || reason || inFlight.current || sent) return;
    inFlight.current = true;
    setBusy("approve");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          body: trimmed,
          // The meta send route needs the platform to reply on; SMS/WhatsApp
          // routes ignore the extra field.
          ...(isMeta ? { channel: draft.channel } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't send.");
      if (!active.current) return;
      setSent(true);
      onSent?.();
      // The send route's human-reply upsert clears pendingDraft server-side.
    } catch (err) {
      if (active.current)
        toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(null);
    }
  }

  async function discard() {
    if (inFlight.current || sent) return;
    inFlight.current = true;
    setBusy("discard");
    try {
      await discardConversationDraft(contact.id);
    } catch (error) {
      if (active.current)
        toast.error(
          error instanceof Error ? error.message : "Couldn't discard draft."
        );
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(null);
    }
  }

  return (
    <div className="border-primary/20 bg-primary/5 border-t px-4 py-3">
      <div className="text-primary mb-1.5 flex items-center gap-1.5 text-xs font-medium">
        <Sparkles className="h-3.5 w-3.5" />
        AI suggested reply · {LABEL[draft.channel]} · edit before sending
      </div>
      <Textarea
        value={body}
        aria-label={`AI suggested ${LABEL[draft.channel]} reply`}
        disabled={!!busy || sent}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="bg-background resize-none text-sm"
      />
      {(reason || sent) && (
        <p role="status" className="text-muted-foreground mt-2 text-xs">
          {sent ? "Reply sent." : reason}
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={discard}
          disabled={!!busy || sent}
          className="min-h-11"
        >
          {busy === "discard" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="mr-1 h-3.5 w-3.5" />
          )}
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={approve}
          disabled={!!busy || !body.trim() || !!reason || sent}
          className="min-h-11"
        >
          {busy === "approve" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          Approve &amp; send
        </Button>
      </div>
    </div>
  );
}
