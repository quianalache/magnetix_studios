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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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
import { isCoreSidebarBlock, isCoreBodyBlock } from "@/types/course-theme";
import type { CourseOffer } from "@/types/course-offers";
import type { CourseTheme } from "@/types/course-theme";
import type { StandaloneCourse } from "@/types/standalone-courses";

const TABS = ["Layout", "Header", "Hero", "Body", "Sidebar"] as const;
type Tab = (typeof TABS)[number];

const TAB_ICONS: Record<Tab, typeof LayoutPanelLeft> = {
  Layout: LayoutPanelLeft,
  Header: PanelTop,
  Hero: GalleryHorizontal,
  Body: Rows3,
  Sidebar: PanelRight,
};

/**
 * Agency Course Offer theme editor — mirrors the tenant Offer theme
 * editor (`courses/offers/[offerId]/theme/page.tsx`), fetch-based instead
 * of realtime Firestore, `saId="agency"` threaded through. No Extra Info/
 * Agreement tabs — agency offers don't expose those checkout-settings
 * toggles this pass (see EnrollOfferModal's own doc comment).
 */
export default function AgencyOfferThemeEditorPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const apiBase = "/api/agency/course-offers";

  const [offer, setOffer] = useState<CourseOffer | null>(null);
  const [otherOffers, setOtherOffers] = useState<CourseOffer[]>([]);
  const [allCourses, setAllCourses] = useState<StandaloneCourse[]>([]);
  const [theme, setTheme] = useState<CourseTheme | null>(null);
  const [tab, setTab] = useState<Tab>("Layout");
  const [panelOpen, setPanelOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    fetch(`${apiBase}/${offerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { offer?: CourseOffer } | null) => {
        setOffer(d?.offer ?? null);
        setTheme(d?.offer?.theme ?? null);
      })
      .catch(() => setOffer(null))
      .finally(() => setLoaded(true));
    fetch(apiBase)
      .then((r) => r.json())
      .then((d: { offers?: CourseOffer[] }) => setOtherOffers(d.offers ?? []))
      .catch(() => {});
    fetch("/api/agency/standalone-courses")
      .then((r) => r.json())
      .then((d: { courses?: StandaloneCourse[] }) => setAllCourses(d.courses ?? []))
      .catch(() => {});
  }, [isOwner, offerId, apiBase]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Course Offers is managed by the agency owner.
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!offer || !theme) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Offer not found.{" "}
        <Link href="/agency/course-offers" className="underline">
          Back to Course Offers
        </Link>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/${offerId}/theme`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) throw new Error();
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
      const res = await fetch("/api/agency/course-theme-templates", {
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

  const selectableOffers = otherOffers.filter((o) => o.id !== offerId && o.visibility === "published");

  return (
    <div className="flex h-dvh flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <Link
          href={`/agency/course-offers/${offerId}`}
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
          <a href={`/offer/agency/${offerId}`} target="_blank" rel="noreferrer">
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
                  onUploadImage={(file) => uploadCourseOfferThemeImage(file, "agency", offerId, "background")}
                  saId="agency"
                  agencyScope
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
                  onUploadImage={(file) => uploadCourseOfferThemeImage(file, "agency", offerId, "hero")}
                />
              )}
              {tab === "Body" && (
                <OfferBlockPanel
                  blocks={theme.body.filter((b) => !isCoreBodyBlock(b))}
                  onChange={(body) => setTheme({ ...theme, body })}
                  saId="agency"
                  offerId={offerId}
                  otherOffers={selectableOffers}
                  region="body"
                />
              )}
              {tab === "Sidebar" && (
                <OfferBlockPanel
                  blocks={theme.sidebar.filter((b) => !isCoreSidebarBlock(b))}
                  onChange={(sidebar) => setTheme({ ...theme, sidebar })}
                  saId="agency"
                  offerId={offerId}
                  otherOffers={selectableOffers}
                  region="sidebar"
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
            saId="agency"
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
