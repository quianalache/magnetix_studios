"use client";

import { useState } from "react";
import { Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CommunityReviewView } from "@/types/community";

export function CommunityReviewForm({
  saId,
  groupId,
  brand,
  currentReview,
}: {
  saId: string;
  groupId: string;
  brand: string;
  currentReview: CommunityReviewView | null;
}) {
  const [rating, setRating] = useState(currentReview?.rating ?? 5);
  const [body, setBody] = useState(currentReview?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/reviews/me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save review");
      setDeleted(false);
      toast.success("Review saved.");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save review");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete your review?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/reviews/me`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Couldn't delete review");
      setDeleted(true);
      setBody("");
      toast.success("Review deleted.");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete review");
    } finally {
      setSaving(false);
    }
  }

  if (deleted) return null;

  return (
    <div className="rounded-lg border border-[#E4E4E4] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#202124]">
          {currentReview ? "Update your review" : "Leave a review"}
        </h3>
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              className="rounded p-0.5"
              aria-label={`${n} stars`}
            >
              <Star
                className={cn("h-5 w-5", n <= rating ? "fill-current" : "")}
                style={{ color: n <= rating ? brand : "#c7c7c7" }}
              />
            </button>
          ))}
        </div>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 600))}
        rows={4}
        placeholder="Share what changed for you inside this community."
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-[#909090]">{body.length}/600</span>
        <div className="flex items-center gap-2">
          {currentReview && (
            <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={saving}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save review
          </Button>
        </div>
      </div>
    </div>
  );
}
