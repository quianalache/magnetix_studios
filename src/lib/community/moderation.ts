import type { CommunityReportReason } from "@/types/community";

export const COMMUNITY_REPORT_REASONS: readonly { value: CommunityReportReason; label: string }[] = [
  { value: "spam_or_scam", label: "Spam or scam" },
  { value: "harassment_or_bullying", label: "Harassment or bullying" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "misinformation", label: "Misinformation" },
  { value: "privacy_or_safety", label: "Privacy or safety concern" },
  { value: "other", label: "Other" },
];

export const COMMUNITY_REPORT_REASON_LABELS = Object.fromEntries(
  COMMUNITY_REPORT_REASONS.map((reason) => [reason.value, reason.label]),
) as Record<CommunityReportReason, string>;

export function reportReasonLabel(reason: CommunityReportReason): string {
  return COMMUNITY_REPORT_REASON_LABELS[reason] ?? "Other";
}
