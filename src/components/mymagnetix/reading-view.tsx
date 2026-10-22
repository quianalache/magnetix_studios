"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/my/readings"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            My Readings
          </Link>
          <Link href="/my" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-chip bg-primary text-primary-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <span className="text-body font-bold text-foreground">MyMagnetix</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6 sm:py-8" data-mymagnetix-reading>
        <PageHeader
          eyebrow={businessName}
          title={`${r.name}’s Reading`}
          description={`${r.birthPlace} · ${date} · ${r.birthTime}`}
          actions={<PdfButton ctx={ctx} />}
        />
        <ReadingSections ctx={ctx} views={["humanDesign", "mandala", "astrology"]} full />
      </main>
    </div>
  );
}
