"use client";

import { BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";

/**
 * Community Home right-rail "Community Guidelines" entry (Part 10). Reads
 * the group's own `guidelinesHtml` (new field — no field previously existed,
 * see Part 14.D) through the same sanitizer already used for `aboutHtml`
 * (`renderLessonBodyHtml`). Renders nothing when empty — no hardcoded
 * fallback copy, per the explicit instruction not to hardcode guidelines.
 */
export function GuidelinesCard({ guidelinesHtml }: { guidelinesHtml: string }) {
  if (!guidelinesHtml.trim()) return null;

  return (
    <Dialog>
      <DialogTrigger className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#E4E4E4] bg-white p-4 text-left hover:border-[#d4d4d4]">
        <span className="flex items-center gap-2 text-sm font-semibold text-[#202124]">
          <BookOpen className="h-4 w-4 text-[#909090]" />
          Community Guidelines
        </span>
        <span className="text-xs text-[#909090]">View</span>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Community Guidelines</DialogTitle>
        </DialogHeader>
        <div
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderLessonBodyHtml(guidelinesHtml) }}
        />
      </DialogContent>
    </Dialog>
  );
}
