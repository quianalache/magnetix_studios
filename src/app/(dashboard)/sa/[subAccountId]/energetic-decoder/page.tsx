"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EnergeticDecoderHomeTab, type EnergeticDecoderHomeTarget } from "@/components/energetic-decoder/home-tab";
import { EnergeticDecoderReportBuilderTab } from "@/components/energetic-decoder/report-builder-tab";
import { EnergeticDecoderContentTab } from "@/components/energetic-decoder/content-tab";
import { EnergeticDecoderReadingsTab } from "@/components/energetic-decoder/readings-tab";
import { EnergeticDecoderChartDesignsTab } from "@/components/energetic-decoder/chart-designs-tab";
import { EnergeticDecoderEmbedsTab } from "@/components/energetic-decoder/embeds-tab";
import { DECODER_TABS, DecoderNavProvider, type DecoderTab } from "@/components/energetic-decoder/decoder-shell";

type Tab = DecoderTab;

const VALID_TABS: Tab[] = DECODER_TABS.map((t) => t.key);

/**
 * Structured after researching bodygraph.com (2026-08-05, then again more
 * thoroughly 2026-08-08/09 at her explicit request). Rev 2 of the tab
 * structure (2026-08-09): a real Home overview up front, and Chart Designs
 * and Embeds as list-first, multi-item tabs.
 *
 * v2 design migration (2026-10-16, owner-approved proof): the page is no
 * longer a `.momentum-scope` lavender frame with its own title and underline
 * tabs. Each tab renders the shared Decoder shell (decoder-shell.tsx) — a
 * real Magnetix page header with the section tabs in the pill strip under
 * it — and record pages (a reading) lead with their breadcrumb instead.
 */
export default function EnergeticDecoderPage() {
  // The module tab IS the URL's `?tab=` (2026-10-07). No `?tab=` — which
  // is exactly what the sidebar's Energetic Decoder link opens — means
  // Home, the owner's locked module entry point. (Decision 3's "Readings by
  // default" is retired: it made a sidebar click land in Readings, and the
  // old Readings tab then auto-opened the newest reading — "Staff QA Test".)
  // Intentional deep links always name their tab (`?tab=readings&profileId=…`
  // from Contact → View Chart, `?tab=builder` from the Report Editor, …), so
  // they still land where they point. Deriving the tab from the URL instead
  // of one-time state also means a sidebar click while already inside the
  // module resets to Home, and Back/Forward move between tabs.
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = VALID_TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "home";
  const router = useRouter();
  const pathname = usePathname();

  /** Switching module tabs is a navigation (`?tab=…` only), so Readings' own params never leak into another tab and Back returns to the previous tab. */
  function selectTab(next: Tab) {
    if (next === tab && !searchParams.get("profileId") && !searchParams.get("readingId") && !searchParams.get("set")) return;
    router.push(`${pathname}?tab=${next}`, { scroll: false });
  }

  function goto(target: EnergeticDecoderHomeTarget) {
    selectTab(target);
  }

  return (
    <DecoderNavProvider value={{ tab, selectTab }}>
      {tab === "home" && <EnergeticDecoderHomeTab onGoto={goto} />}
      {tab === "builder" && <EnergeticDecoderReportBuilderTab />}
      {tab === "content" && <EnergeticDecoderContentTab />}
      {tab === "readings" && <EnergeticDecoderReadingsTab />}
      {tab === "chartDesigns" && <EnergeticDecoderChartDesignsTab />}
      {tab === "embeds" && <EnergeticDecoderEmbedsTab />}
    </DecoderNavProvider>
  );
}
