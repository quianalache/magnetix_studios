import type { Contact } from "@/types/contacts";
import type { SubAccountDoc, SubAccountMemberDoc } from "@/types";
import type { ConversationAvailability, ConversationChannel } from "@/types/conversations";
import { metaCanInbox, metaCanInstagramDm } from "@/lib/comms/meta-capabilities";
import { aiChannelGateOn } from "@/lib/comms/ai/gates";
import type { AiAgentProfile, AiChannelConfig } from "@/types/ai";

export interface AvailabilityInput {
  contact: Contact;
  sub: SubAccountDoc;
  dedicatedSms: boolean;
  sharedSms: boolean;
  whatsappConfigured: boolean;
  emailConfigured: boolean;
  latestInbound: Partial<Record<ConversationChannel, number>>;
  whatsappWindowHours: number;
  now: number;
}

/** Pure projection: only fixed, safe explanations leave this boundary. */
export function conversationChannels(input: AvailabilityInput): ConversationAvailability[] {
  const { contact, sub } = input;
  const windowOpen = (channel: ConversationChannel, hours: number) => {
    const at = input.latestInbound[channel];
    return at !== undefined && Number.isFinite(at) && at <= input.now &&
      input.now - at < hours * 3_600_000;
  };
  const result = (channel: ConversationChannel, reason?: string, notice?: string): ConversationAvailability => ({
    channel, available: !reason, ...(reason ? { reason } : {}), ...(notice ? { notice } : {}),
  });
  const metaReason = (channel: "messenger" | "instagram") => {
    const cfg = sub.metaConfig;
    if (!contact.metaUserId) return "This contact has no Facebook/Instagram messaging identity.";
    if (sub.metaInboxEnabledByAgency !== true) return "The agency has disabled this inbox.";
    if (!cfg?.connected || !cfg.pageAccessToken || !cfg.pageId) return "Connect a Facebook Page to reply.";
    if (channel === "instagram" ? !cfg.instagramBusinessAccountId || !metaCanInstagramDm(cfg) : !metaCanInbox(cfg))
      return "This connection does not have the required messaging capability.";
    if (!windowOpen(channel, 24)) return "The 24-hour reply window is closed on this channel.";
    return undefined;
  };
  return [
    result("sms", contact.smsOptedOut ? "This contact has opted out of SMS." :
      !contact.phone?.trim() ? "This contact has no phone number." :
      !input.dedicatedSms && !input.sharedSms ? "SMS sending is not configured or allowed." : undefined,
      !input.dedicatedSms && input.sharedSms ? "Shared sender: outgoing history is available; incoming replies are not routed to this inbox." : undefined),
    result("whatsapp", contact.whatsappOptedOut ? "This contact has opted out of WhatsApp." :
      !contact.phone?.trim() ? "This contact has no phone number." :
      sub.whatsappEnabledByAgency !== true || !input.whatsappConfigured ? "WhatsApp sending is not configured or allowed." :
      !windowOpen("whatsapp", input.whatsappWindowHours) ? "The WhatsApp reply window is closed. An approved template is required." : undefined),
    result("messenger", metaReason("messenger")),
    result("instagram", metaReason("instagram")),
    result("email", contact.deliverabilitySuppressed ? "Email delivery is suppressed for this contact." :
      !contact.email?.trim() ? "This contact has no email address." :
      !input.emailConfigured ? "Email replies require an enabled, verified sending domain." : undefined,
      contact.emailOptedOut ? "Unsubscribed from marketing email. Only direct, non-promotional replies are appropriate." : undefined),
  ];
}

export function eligibleConversationMember(member: Partial<SubAccountMemberDoc>, sub: SubAccountDoc, contact: Contact): boolean {
  if (member.status !== "active" || (member.role !== "admin" && member.role !== "collaborator")) return false;
  if (member.subAccountId && member.subAccountId !== contact.subAccountId) return false;
  if (member.agencyId && member.agencyId !== contact.agencyId) return false;
  return member.role === "admin" || sub.territoryScopingEnabled !== true ||
    contact.territoryId === "global" ||
    (!!contact.territoryId && (member.assignedTerritoryIds ?? []).includes(contact.territoryId));
}

export function conversationAiAvailability(input: {
  channel?: ConversationChannel;
  channels: ConversationAvailability[];
  sub: SubAccountDoc;
  dedicatedSms: boolean;
  configured: boolean;
  agent: {
    profile?: Partial<AiAgentProfile>;
    sms?: Partial<AiChannelConfig>;
    whatsapp?: Partial<AiChannelConfig>;
    meta?: Partial<AiChannelConfig>;
  };
}): { aiAvailable: boolean; aiReason?: string } {
  const unavailable = (aiReason: string) => ({ aiAvailable: false, aiReason });
  if (input.channel === "email") return unavailable("AI replies are not supported for email.");
  if (!input.channel) return unavailable("No messaging channel has been established.");
  if (!input.configured) return unavailable("The AI provider is not configured.");
  if (!input.channels.find((c) => c.channel === input.channel)?.available)
    return unavailable("This channel is currently unavailable for replies.");
  if (input.channel === "sms" && !input.dedicatedSms)
    return unavailable("SMS AI replies require a dedicated sender.");
  const configChannel = input.channel === "messenger" || input.channel === "instagram" ? "meta" : input.channel;
  if (!aiChannelGateOn(input.sub, configChannel)) return unavailable("The agency has disabled AI on this channel.");
  if (!input.agent.profile?.systemPrompt?.trim() || input.agent[configChannel]?.enabled !== true)
    return unavailable("Configure and enable the AI agent for this channel.");
  return { aiAvailable: true };
}

export function parseConversationPatch(value: unknown): { status?: "open" | "closed"; assigneeUid?: string | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (!keys.length || keys.some((key) => key !== "status" && key !== "assigneeUid")) return null;
  if ("status" in data && data.status !== "open" && data.status !== "closed") return null;
  if ("assigneeUid" in data && data.assigneeUid !== null &&
      (typeof data.assigneeUid !== "string" || !data.assigneeUid.trim() || data.assigneeUid.includes("/"))) return null;
  return data as { status?: "open" | "closed"; assigneeUid?: string | null };
}
