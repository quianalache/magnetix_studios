"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ReadingSections } from "@/components/energetic-decoder/reading-blocks/standard-result";
import { PdfButton } from "@/components/energetic-decoder/reading-blocks/next-step-blocks";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * A Reading in MyMagnetix (2026-10-21) — the permanent home. The full
 * Reading, every section visible down the page, built from the same Reading
 * blocks as the Standard Result and Reading Result Pages, in the Chart
 * Design and wording saved with it.
 */
export function MyMagnetixReadingView({ ctx, businessName }: { ctx: ReadingBlockContext; businessName: string }) {
  const r = ctx.reading;
  const date = (() => {
    try {
      return new Date(`${r.birthDate}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    } catch {
      return r.birthDate;
    }
  })();
  return (
    <div className="min-h-screen bg-[#F5F4FB]">
      <header className="border-b border-[#ECE9F5] bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/my/readings" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6B7280] hover:text-[#111827]">
            <ArrowLeft className="h-4 w-4" />
            My Readings
          </Link>
          <Link href="/my" className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold text-white"
              style={{ background: "linear-gradient(135deg, #A855F7, #5E2574)" }}
            >
              M
            </span>
            <span className="text-[14px] font-bold text-[#202124]">MyMagnetix</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-6 sm:px-6 sm:py-8" data-mymagnetix-reading>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-[#84809A]">{businessName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-pretty text-[#1D1B27]">{r.name}&rsquo;s Reading</h1>
            <p className="mt-1 text-sm text-[#84809A]">
              {r.birthPlace} · {date} · {r.birthTime}
            </p>
          </div>
          <PdfButton ctx={ctx} />
        </div>
        <ReadingSections ctx={ctx} views={["humanDesign", "mandala", "astrology"]} full />
      </main>
    </div>
  );
}
