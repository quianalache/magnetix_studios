"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CommunityReportContentType, CommunityReportReason } from "@/types/community";
import { COMMUNITY_REPORT_REASONS } from "@/lib/community/moderation";

export function ReportContentDialog({ saId, groupId, contentType, contentId, parentId, conversationId, reportedMemberId, endpoint, brand, onClose }: { saId: string; groupId: string; contentType: CommunityReportContentType; contentId: string; parentId?: string | null; conversationId?: string | null; reportedMemberId?: string; endpoint?: string; brand: string; onClose: () => void }) {
  const [reason, setReason] = useState<CommunityReportReason>("spam_or_scam");
  const [context, setContext] = useState("");
  const [sending, setSending] = useState(false);
  const label = contentType === "direct_message" ? "message" : contentType;
  async function submit() {
    setSending(true);
    const res = await fetch(endpoint ?? `/api/community/${saId}/${groupId}/moderation/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType, contentId, parentId, conversationId, reportedMemberId, reason, reporterContext: context }) });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) { toast.error(data.error ?? "Couldn't submit report"); return; }
    toast.success("Report submitted for moderator review"); onClose();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5"><h2 className="text-xl font-semibold text-[#24102f]">Report content</h2><p className="text-sm text-[#6b6070]">Tell us why you&apos;re reporting this {label}.</p></div><div className="space-y-2">{COMMUNITY_REPORT_REASONS.map((item) => <label key={item.value} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${reason === item.value ? "bg-[#fde6ee]" : ""}`}><input type="radio" name="report-reason" checked={reason === item.value} onChange={() => setReason(item.value)} style={{ accentColor: brand }} />{item.label}</label>)}</div><label className="mt-5 block text-sm font-semibold text-[#24102f]">Additional context <span className="font-normal text-[#817783]">(optional)</span><textarea value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} rows={4} placeholder="Share any helpful details…" className="mt-1 w-full rounded-lg border border-[#ddd3dd] p-3 text-sm" /></label><p className="mt-4 rounded-lg bg-[#f8f3f7] p-3 text-xs text-[#6b6070]">Reports are reviewed by community moderators.</p><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button disabled={sending} onClick={() => void submit()} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: brand }}>{sending ? "Submitting…" : "Submit report"}</button></div></div></div>;
}
