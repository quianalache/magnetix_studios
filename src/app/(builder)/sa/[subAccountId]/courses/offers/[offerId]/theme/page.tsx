"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  LayoutPanelLeft,
  PanelTop,
  GalleryHorizontal,
  Rows3,
  PanelRight,
  ChevronLeft,
  ChevronRight,
  UserRound,
  FileCheck2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToCourseOffer, subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import { subscribeToStandaloneCourses } from "@/lib/firestore/standalone-courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { uploadCourseOfferThemeImage } from "@/lib/community/upload-image";
import { LayoutPanel } from "@/components/standalone-courses/theme-editor/layout-panel";
import { HeaderPanel } from "@/components/standalone-courses/theme-editor/header-panel";
import { HeroPanel } from "@/components/standalone-courses/theme-editor/hero-panel";
import { OfferBlockPanel } from "@/components/course-offers/theme-editor/offer-block-panel";
import { OfferThemeLivePreview } from "@/components/course-offers/theme-editor/offer-live-preview";
import {
  ExtraContactInfoPanel,
  ServiceAgreementPanel,
} from "@/components/course-offers/theme-editor/checkout-settings-panels";
import {
  DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
  type CourseOffer,
  type CourseOfferCheckoutSettings,
} from "@/types/course-offers";
import { isCoreSidebarBlock } from "@/types/course-theme";
import type { CourseTheme } from "@/types/course-theme";
import type { StandaloneCourse } from "@/types/standalone-courses";

const TABS = [
  "Layout",
  "Header",
  "Hero",
  "Body",
  "Sidebar",
  "Extra Info",
  "Agreement",
] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof LayoutPanelLeft> = {
  Layout: LayoutPanelLeft,
  Header: PanelTop,
  Hero: GalleryHorizontal,
  Body: Rows3,
  Sidebar: PanelRight,
  "Extra Info": UserRound,
  Agreement: FileCheck2,
};

/**
 * Course Offer theme editor — the "Edit Checkout" destination. Same system
 * Standalone Courses use (colors/fonts/header/hero/body/sidebar blocks,
 * live preview, shared templates), forked from
 * `courses/[courseId]/theme/page.tsx` rather than genuinely shared, since
 * an Offer's Body/Sidebar are both plain block lists (no Progress/
 * Instructor core blocks — see `DEFAULT_OFFER_THEME`), so both tabs reuse
 * the one `OfferBlockPanel` instead of two separate panels.
 */
export default function OfferThemeEditorPage({
  params,
}: {
  params: Promise<{ subAccountId: string; offerId: string }>;
}) {
  const { offerId } = use(params);
  const { subAccountId } = useSubAccount();
  const apiBase = `/api/sub-accounts/${subAccountId}`;

  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [otherOffers, setOtherOffers] = useState<CourseOffer[]>([]);
  const [allCourses, setAllCourses] = useState<StandaloneCourse[]>([]);
  const [theme, setTheme] = useState<CourseTheme | null>(null);
  const [checkoutSettings, setCheckoutSettings] =
    useState<CourseOfferCheckoutSettings | null>(null);
  const [tab, setTab] = useState<Tab>("Layout");
  const [panelOpen, setPanelOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    const u1 = subscribeToCourseOffer(subAccountId, offerId, (o) => {
      setOffer(o);
      setTheme((prev) => prev ?? o?.theme ?? null);
      setCheckoutSettings(
        (prev) =>
          prev ??
          o?.checkoutSettings ??
          DEFAULT_COURSE_OFFER_CHECKOUT_SETTINGS,
      );
      setLoaded(true);
    });
    const u2 = subscribeToCourseOffers(subAccountId, setOtherOffers);
    const u3 = subscribeToStandaloneCourses(subAccountId, setAllCourses);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subAccountId, offerId]);

  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!offer || !theme || !checkoutSettings) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Offer not found.{" "}
        <Link href={`/sa/${subAccountId}/courses`} className="underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const [themeRes, settingsRes] = await Promise.all([
        fetch(`${apiBase}/course-offers/${offerId}/theme`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme }),
        }),
        fetch(`${apiBase}/course-offers/${offerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutSettings }),
        }),
      ]);
      if (!themeRes.ok || !settingsRes.ok) throw new Error();
      toast.success("Checkout page saved.");
    } catch {
      toast.error("Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) {
      toast.error("Name the template first");
      return;
    }
    setSavingTemplate(true);
    try {
      const res = await fetch(`${apiBase}/course-theme-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName, theme }),
      });
      if (!res.ok) throw new Error();
      toast.success("Template saved.");
      setTemplateName("");
    } catch {
      toast.error("Couldn't save template");
    } finally {
      setSavingTemplate(false);
    }
  }

  const selectableOffers = otherOffers.filter(
    (o) => o.id !== offerId && o.visibility === "published",
  );

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <Link
          href={`/sa/${subAccountId}/courses/offers/${offerId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="rounded-lg border px-4 py-1.5 text-sm font-medium text-foreground">
          {offer.title} — Edit Checkout
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[#1a1a1a] text-white hover:bg-[#1a1a1a]/85"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
          <Popover>
            <PopoverTrigger
              className={cn(
                "rounded-full bg-rose-100 px-3 py-1.5 text-sm font-medium text-rose-950 hover:bg-rose-200",
              )}
            >
              Save as Template
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Template name</p>
              <div className="flex gap-2">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g. Bold & Modern"
                  className="flex-1"
                />
                <Button size="sm" onClick={saveAsTemplate} disabled={savingTemplate}>
                  {savingTemplate && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <a href={`/offer/${subAccountId}/${offerId}`} target="_blank" rel="noreferrer">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full bg-violet-100 text-violet-900 hover:bg-violet-200"
            >
              <ExternalLink className="h-4 w-4" /> Preview
            </Button>
          </a>
        </div>
      </div>

      {/* Editor body: icon rail + collapsible settings panel + live preview */}
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-20 shrink-0 flex-col items-center gap-2 border-r py-4">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            const selected = tab === t;
            return (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setPanelOpen(true);
                }}
                className="flex w-full flex-col items-center gap-1 py-1 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors",
                    selected
                      ? "border-indigo-300 bg-rose-50 text-rose-950"
                      : "border-transparent hover:bg-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {t}
              </button>
            );
          })}
        </nav>

        {panelOpen && (
          <div className="relative w-[360px] shrink-0 overflow-y-auto border-r">
            <div className="p-5">
              {tab === "Layout" && (
                <LayoutPanel
                  colors={theme.colors}
                  fonts={theme.fonts}
                  background={theme.background}
                  onColorsChange={(colors) => setTheme({ ...theme, colors })}
                  onFontsChange={(fonts) => setTheme({ ...theme, fonts })}
                  onBackgroundChange={(background) => setTheme({ ...theme, background })}
                  onUploadImage={(file) =>
                    uploadCourseOfferThemeImage(file, subAccountId, offerId, "background")
                  }
                  saId={subAccountId}
                  applyTarget={{ offerId }}
                  onApplied={setTheme}
                />
              )}
              {tab === "Header" && (
                <HeaderPanel
                  value={theme.header}
                  onChange={(header) => setTheme({ ...theme, header })}
                />
              )}
              {tab === "Hero" && (
                <HeroPanel
                  value={theme.hero}
                  onChange={(hero) => setTheme({ ...theme, hero })}
                  onUploadImage={(file) =>
                    uploadCourseOfferThemeImage(file, subAccountId, offerId, "hero")
                  }
                />
              )}
              {tab === "Body" && (
                <OfferBlockPanel
                  blocks={theme.body}
                  onChange={(body) => setTheme({ ...theme, body })}
                  saId={subAccountId}
                  offerId={offerId}
                  otherOffers={selectableOffers}
                  region="body"
                />
              )}
              {tab === "Sidebar" && (
                <OfferBlockPanel
                  // An Offer's sidebar never has core Progress/Instructor
                  // blocks (see DEFAULT_OFFER_THEME) — filtered defensively
                  // in case a template that had them slipped through before
                  // apply-time stripping, same as OfferSalesPageView does.
                  blocks={theme.sidebar.filter((b) => !isCoreSidebarBlock(b))}
                  onChange={(sidebar) => setTheme({ ...theme, sidebar })}
                  saId={subAccountId}
                  offerId={offerId}
                  otherOffers={selectableOffers}
                  region="sidebar"
                />
              )}
              {tab === "Extra Info" && (
                <ExtraContactInfoPanel
                  value={checkoutSettings}
                  onChange={setCheckoutSettings}
                />
              )}
              {tab === "Agreement" && (
                <ServiceAgreementPanel
                  value={checkoutSettings}
                  onChange={setCheckoutSettings}
                />
              )}
            </div>
          </div>
        )}

        <button
          onClick={() => setPanelOpen((o) => !o)}
          title={panelOpen ? "Collapse panel" : "Expand panel"}
          className="flex w-5 shrink-0 items-center justify-center border-r bg-muted/30 text-muted-foreground hover:bg-muted"
        >
          {panelOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 overflow-y-auto bg-[#F8F7F5]">
          <OfferThemeLivePreview
            saId={subAccountId}
            offerId={offerId}
            offer={offer}
            theme={theme}
            allCourses={allCourses}
            otherOffers={otherOffers}
          />
        </div>
      </div>
    </div>
  );
}
