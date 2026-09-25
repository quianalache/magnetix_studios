import { Mail, MessageCircle, MessageSquare, Instagram, Facebook } from "lucide-react";
import type { ConversationChannel } from "@/types/conversations";
import { cn } from "@/lib/utils";

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  sms: "SMS", email: "Email", whatsapp: "WhatsApp", messenger: "Messenger", instagram: "Instagram",
};
const icons = { sms: MessageSquare, email: Mail, whatsapp: MessageCircle, messenger: Facebook, instagram: Instagram };
const colors = { sms: "bg-violet-500/10 text-violet-600 dark:text-violet-300", email: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300", whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", messenger: "bg-blue-500/10 text-blue-600 dark:text-blue-300", instagram: "bg-pink-500/10 text-pink-600 dark:text-pink-300" };

export function ChannelBadge({ channel }: { channel: ConversationChannel }) {
  const Icon = icons[channel] ?? MessageCircle;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", colors[channel])}><Icon className="size-3" aria-hidden="true" />{CHANNEL_LABELS[channel] ?? channel}</span>;
}

export function ContactInitials({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(v => v[0]).join("").toUpperCase() || "?";
  return <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary", large ? "size-20 text-2xl" : "size-11 text-sm")}>{initials}</span>;
}
