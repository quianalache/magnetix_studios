import { Mail, MessageCircle, MessageSquare, Instagram, Facebook } from "lucide-react";
import type { ConversationChannel } from "@/types/conversations";
import { cn } from "@/lib/utils";

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  sms: "SMS", email: "Email", whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram",
};
const icons = { sms: MessageSquare, email: Mail, whatsapp: MessageCircle, messenger: Facebook, instagram: Instagram };

/** Channel → tag-palette tone (restrained accent; one per channel). Shared by badges and thread chips. */
export const CHANNEL_TONE: Record<ConversationChannel, string> = {
  sms: "bg-tag-violet-bg text-tag-violet-fg",
  email: "bg-tag-aqua-bg text-tag-aqua-fg",
  whatsapp: "bg-tag-green-bg text-tag-green-fg",
  messenger: "bg-tag-blue-bg text-tag-blue-fg",
  instagram: "bg-tag-pink-bg text-tag-pink-fg",
};

export function ChannelBadge({ channel }: { channel: ConversationChannel }) {
  const Icon = icons[channel] ?? MessageCircle;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-micro font-medium whitespace-nowrap", CHANNEL_TONE[channel] ?? CHANNEL_TONE.sms)}>
      <Icon className="size-3" aria-hidden="true" />
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  );
}

export function ContactInitials({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(v => v[0]).join("").toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-tag-violet-bg font-semibold text-tag-violet-fg",
        large ? "size-12 text-section" : "size-9 text-caption",
      )}
    >
      {initials}
    </span>
  );
}
