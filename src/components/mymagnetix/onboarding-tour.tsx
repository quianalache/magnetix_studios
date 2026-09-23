"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

const STORAGE_PREFIX = "mymagnetix:onboarding:v1:";

type TourStep = {
  eyebrow?: string;
  title: string;
  body: string;
  targets?: string[];
  final?: boolean;
};

const STEPS: TourStep[] = [
  { eyebrow: "Welcome", title: "Welcome to MyMagnetix ✨", body: "This is your home for everything connected to your Magnetix account, including your communities, courses, purchases, spaces, and more. We’ll give you a quick tour so you know where everything lives." },
  { eyebrow: "Your navigation", title: "Your navigation lives here", body: "Use this menu to move between Home, Courses, Communities, Readings, Your Spaces, Purchases, and other MyMagnetix areas.", targets: ["#mymagnetix-sidebar", "#mymagnetix-mobile-menu-button"] },
  { title: "Pick up where you left off", body: "Your recently accessed courses and content show up here, so it’s easy to jump back in.", targets: ["#mymagnetix-continue"] },
  { title: "See your spaces", body: "Your Spaces shows the programs, brands, communities, and environments you’re part of inside MyMagnetix.", targets: ["#mymagnetix-spaces"] },
  { eyebrow: "Quick actions", title: "Jump to what matters most ✨", body: "Quick actions give you one-click access to common destinations so you can get where you need to go fast. You can always come back here and explore at your own pace.", targets: ["#mymagnetix-quick-actions"] },
  { eyebrow: "Coming up", title: "Never miss a scheduled event", body: "Your events and sessions for this week will show up here, so you always know what’s coming next.", targets: ["#mymagnetix-coming-up"] },
  { eyebrow: "Stay informed", title: "Stay up to date", body: "Keep an eye on important updates here, like invoices that need attention or payments coming up this week.", targets: ["#mymagnetix-attention", "#mymagnetix-payments"], final: true },
];

type Rect = { top: number; left: number; width: number; height: number };

function getRects(selectors: string[]): Rect[] {
  return selectors
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .filter((element): element is HTMLElement => !!element && element.getBoundingClientRect().width > 0)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    });
}

export function MyMagnetixOnboardingTour({ primaryEmail }: { primaryEmail: string }) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${primaryEmail.trim().toLowerCase()}`, [primaryEmail]);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const step = stepIndex === null ? null : STEPS[stepIndex];

  const measure = useCallback(() => {
    if (step) setRects(getRects(step.targets ?? []));
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    const legacyStatus = () => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { status?: unknown };
        return parsed.status === "completed" || parsed.status === "dismissed" ? parsed.status : null;
      } catch {
        return null;
      }
    };

    async function loadAccountState() {
      try {
        const response = await fetch("/api/my/onboarding", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { status?: "completed" | "dismissed" | null };
        if (cancelled) return;
        if (data.status) {
          setStepIndex(null);
          return;
        }

        const legacy = legacyStatus();
        if (legacy) {
          const migrated = await fetch("/api/my/onboarding", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: legacy }),
          });
          if (migrated.ok) {
            try { window.localStorage.removeItem(storageKey); } catch { /* Account state is now authoritative. */ }
          }
          if (!cancelled) setStepIndex(null);
          return;
        }
        setStepIndex(0);
      } catch {
        // Do not show a tour when account state cannot be read; this avoids
        // replaying an already-completed tour during a transient outage.
      }
    }
    void loadAccountState();
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!step) return;
    step.targets?.forEach((selector) => {
      const target = document.querySelector<HTMLElement>(selector);
      if (target && target.getBoundingClientRect().width > 0 && selector !== "#mymagnetix-mobile-menu-button") target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const id = window.setTimeout(measure, 180);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [measure, step]);

  const finish = useCallback(async (status: "completed" | "dismissed") => {
    const response = await fetch("/api/my/onboarding", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    if (!response?.ok) {
      // Temporary browser fallback prevents an immediate replay if the write
      // is interrupted; it is never consulted when account state is present.
      try { window.localStorage.setItem(storageKey, JSON.stringify({ status, at: new Date().toISOString() })); } catch { /* Best effort only. */ }
    } else {
      try { window.localStorage.removeItem(storageKey); } catch { /* Account state is authoritative. */ }
    }
    setStepIndex(null);
  }, [storageKey]);

  if (!step || stepIndex === null) return null;
  const next = () => step.final ? finish("completed") : setStepIndex((current) => (current === null ? 0 : current + 1));

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="mymagnetix-tour-title">
      <div className="absolute inset-0 bg-[#29204d]/45 backdrop-blur-[1px]" />
      {rects.map((rect, index) => (
        <div key={`${rect.left}-${rect.top}-${index}`} className="pointer-events-none absolute rounded-[18px] border-2 border-[#C084FC] shadow-[0_0_0_5px_rgba(192,132,252,0.18),0_0_30px_rgba(168,85,247,0.6)]" style={{ top: Math.max(6, rect.top - 6), left: Math.max(6, rect.left - 6), width: Math.min(window.innerWidth - 12, rect.width + 12), height: Math.min(window.innerHeight - 12, rect.height + 12) }} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div className="relative w-full max-w-[540px] rounded-[22px] border border-white/80 bg-white p-6 shadow-[0_24px_80px_rgba(49,24,81,0.25)] sm:p-8">
          <button type="button" onClick={() => finish("dismissed")} aria-label="Close tour" className="absolute right-4 top-4 rounded-full p-1.5 text-[#8A87A0] transition-colors hover:bg-[#F5F1FA] hover:text-[#5E2574]"><X className="h-5 w-5" /></button>
          <div className="flex items-start justify-between gap-4 pr-7"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F3E8FF] text-[#7E22CE]"><Sparkles className="h-6 w-6" /></div><span className="pt-2 text-[12px] font-medium text-[#77718F]">Step {stepIndex + 1} of 7</span></div>
          {step.eyebrow && <span className="mt-5 inline-flex rounded-full bg-[#F3E8FF] px-3 py-1 text-[12px] font-bold text-[#7E22CE]">{step.eyebrow}</span>}
          <h2 id="mymagnetix-tour-title" className="mt-4 max-w-[430px] text-[29px] font-bold leading-[1.08] tracking-[-0.03em] text-[#1D1B27] sm:text-[34px]">{step.title}</h2>
          <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-[#67627D]">{step.body}</p>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {stepIndex > 0 ? <button type="button" onClick={() => setStepIndex((current) => (current === null ? 0 : current - 1))} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#DCCFEA] px-5 text-[14px] font-semibold text-[#5E2574] transition-colors hover:bg-[#FAF7FD]"><ArrowLeft className="h-4 w-4" /> Back</button> : <button type="button" onClick={() => finish("dismissed")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#DCCFEA] px-5 text-[14px] font-semibold text-[#5E2574] transition-colors hover:bg-[#FAF7FD]">Skip for now</button>}
            <button type="button" onClick={next} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#7E22CE] px-6 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(126,34,206,0.22)] transition-colors hover:bg-[#6B21A8] sm:flex-none">{step.final ? "Start exploring" : stepIndex === 0 ? "Show me around" : "Next"}<ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-6 flex justify-center gap-1.5" aria-label={`Tour progress: step ${stepIndex + 1} of 7`}>{STEPS.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? "w-6 bg-[#7E22CE]" : "w-1.5 bg-[#E5D8F0]"}`} />)}</div>
        </div>
      </div>
    </div>
  );
}
