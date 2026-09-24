"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Sparkles, X } from "lucide-react";

const STORAGE_PREFIX = "mymagnetix:onboarding:v1:";
const GOLD = "#F5C451";

type TourStep = { eyebrow?: string; title: string; body: string; targets?: string[]; final?: boolean };
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
type Viewport = { width: number; height: number };
type TooltipLayout = { style: CSSProperties; centered: boolean; pointerSide: "top" | "right" | "bottom" | "left"; pointerLefts?: number[] };

function getRects(selectors: string[]): Rect[] {
  return selectors.flatMap((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element || element.getBoundingClientRect().width <= 0) return [];
    const rect = element.getBoundingClientRect();
    return [{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }];
  });
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(value, max)); }

function getTooltipLayout(index: number, rects: Rect[], viewport: Viewport): TooltipLayout {
  const width = Math.min(400, viewport.width - 24);
  const height = index === 0 ? 470 : index === 4 ? 350 : index === 6 ? 330 : index === 2 || index === 3 ? 280 : 300;
  if (index === 0 || rects.length === 0) return { centered: true, pointerSide: "top", style: { width } };
  if (viewport.width < 768) {
    const mobileHeight = index === 4 ? 380 : 280;
    const targetBottom = Math.max(...rects.map((rect) => rect.top + rect.height));
    const top = targetBottom + 16;
    const style = top + mobileHeight <= viewport.height - 12 ? { width, left: 12, top } : { width, left: 12, bottom: 12 };
    return { centered: false, pointerSide: "top", style, pointerLefts: rects.map((rect) => clamp(rect.left + rect.width / 2 - 12, 28, width - 28)) };
  }

  const target = rects[0];
  if (index === 1) return { centered: false, pointerSide: "left", style: { width: 360, left: clamp(target.left + target.width + 28, 24, viewport.width - 384), top: 150 } };
  if (index === 2 || index === 3) {
    const left = clamp(target.left + target.width / 2 - width / 2, 24, viewport.width - width - 24);
    const top = target.top - height - 26;
    if (top >= 24) return { centered: false, pointerSide: "bottom", style: { width, left, top } };
    return { centered: false, pointerSide: "top", style: { width, left, top: clamp(target.top + target.height + 26, 24, viewport.height - height - 24) } };
  }
  if (index === 6) {
    const top = Math.max(24, Math.min(...rects.map((rect) => rect.top)) - height - 26);
    const finalWidth = 400;
    const finalLeft = clamp(target.left + target.width / 2 - finalWidth / 2, 24, viewport.width - finalWidth - 24);
    return { centered: false, pointerSide: "bottom", style: { width: finalWidth, left: finalLeft, top }, pointerLefts: rects.map((rect) => clamp(rect.left + rect.width / 2 - finalLeft, 28, finalWidth - 28)) };
  }
  const left = target.left - width - 28;
  if (left >= 24) return { centered: false, pointerSide: "right", style: { width, left, top: clamp(target.top + target.height / 2 - height / 2, 24, viewport.height - height - 24) } };
  return { centered: false, pointerSide: "left", style: { width, left: target.left + target.width + 28, top: clamp(target.top + target.height / 2 - height / 2, 24, viewport.height - height - 24) } };
}

function Pointer({ side, left }: { side: TooltipLayout["pointerSide"]; left?: number }) {
  const base = "absolute h-0 w-0 border-[10px] border-transparent drop-shadow-[0_2px_3px_rgba(49,24,81,0.15)]";
  const style: CSSProperties = left === undefined ? {} : { left };
  if (side === "left") return <span aria-hidden="true" className={`${base} -left-5 top-1/2 -translate-y-1/2 border-r-white`} style={style} />;
  if (side === "right") return <span aria-hidden="true" className={`${base} -right-5 top-1/2 -translate-y-1/2 border-l-white`} style={style} />;
  if (side === "bottom") return <span aria-hidden="true" className={`${base} -bottom-5 left-1/2 -translate-x-1/2 border-t-white`} style={style} />;
  return <span aria-hidden="true" className={`${base} -top-5 left-1/2 -translate-x-1/2 border-b-white`} style={style} />;
}

export function MyMagnetixOnboardingTour({ primaryEmail }: { primaryEmail: string }) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${primaryEmail.trim().toLowerCase()}`, [primaryEmail]);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ width: 1440, height: 900 });
  const step = stepIndex === null ? null : STEPS[stepIndex];
  const measure = useCallback(() => { if (step) { setRects(getRects(step.targets ?? [])); setViewport({ width: window.innerWidth, height: window.innerHeight }); } }, [step]);

  useEffect(() => {
    let cancelled = false;
    const legacyStatus = () => { try { const raw = window.localStorage.getItem(storageKey); if (!raw) return null; const parsed = JSON.parse(raw) as { status?: unknown }; return parsed.status === "completed" || parsed.status === "dismissed" ? parsed.status : null; } catch { return null; } };
    async function loadAccountState() {
      try {
        const response = await fetch("/api/my/onboarding", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { status?: "completed" | "dismissed" | null };
        if (cancelled) return;
        if (data.status) { setStepIndex(null); return; }
        const legacy = legacyStatus();
        if (legacy) {
          const migrated = await fetch("/api/my/onboarding", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: legacy }) });
          if (migrated.ok) { try { window.localStorage.removeItem(storageKey); } catch { /* Account state is authoritative. */ } }
          if (!cancelled) setStepIndex(null);
          return;
        }
        setStepIndex(0);
      } catch { /* Avoid replaying during a transient account-state outage. */ }
    }
    void loadAccountState();
    return () => { cancelled = true; };
  }, [storageKey]);

  useEffect(() => {
    if (!step) return;
    const target = step.targets?.map((selector) => document.querySelector<HTMLElement>(selector)).find((element) => element && element.getBoundingClientRect().width > 0);
    if (target && stepIndex !== 1) target.scrollIntoView({ block: window.innerWidth < 768 ? "start" : "center", behavior: "smooth" });
    const id = window.setTimeout(measure, 220);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => { window.clearTimeout(id); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure); };
  }, [measure, step, stepIndex]);

  const finish = useCallback(async (status: "completed" | "dismissed") => {
    const response = await fetch("/api/my/onboarding", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).catch(() => null);
    if (!response?.ok) { try { window.localStorage.setItem(storageKey, JSON.stringify({ status, at: new Date().toISOString() })); } catch { /* Best effort fallback. */ } } else { try { window.localStorage.removeItem(storageKey); } catch { /* Account state is authoritative. */ } }
    setStepIndex(null);
  }, [storageKey]);

  if (!step || stepIndex === null) return null;
  const next = () => step.final ? finish("completed") : setStepIndex((current) => (current === null ? 0 : current + 1));
  const layout = getTooltipLayout(stepIndex, rects, viewport);
  const contextual = stepIndex > 0;
  const cardClass = contextual ? "p-4 sm:p-5" : "p-6 sm:p-8";
  const iconClass = contextual ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl";
  const iconSizeClass = contextual ? "h-[18px] w-[18px]" : "h-6 w-6";
  const titleClass = contextual ? "mt-3 text-[20px] sm:text-[23px]" : "mt-4 text-[29px] sm:text-[34px]";
  const bodyClass = contextual ? "mt-3 text-[14px] leading-6" : "mt-5 text-[15px] leading-7";
  const headerClass = contextual ? "gap-3 pr-7" : "gap-4 pr-7";
  const stepLabelClass = contextual ? "pt-1 text-[11px]" : "pt-2 text-[12px]";
  const titleWidthClass = contextual ? "max-w-[360px]" : "max-w-[430px]";
  const bodyWidthClass = contextual ? "max-w-[360px]" : "max-w-[460px]";
  const tooltip = (
    <div className={`relative rounded-[22px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(49,24,81,0.25)] ${cardClass}`} style={{ ...layout.style, ...(layout.centered ? {} : { position: "absolute" }) }}>
      {!layout.centered && (layout.pointerLefts?.length ? layout.pointerLefts.map((left, index) => <Pointer key={index} side={layout.pointerSide} left={left} />) : <Pointer side={layout.pointerSide} />)}
      <button type="button" onClick={() => finish("dismissed")} aria-label="Close tour" className="absolute right-4 top-4 rounded-full p-1.5 text-[#8A87A0] transition-colors hover:bg-[#F5F1FA] hover:text-[#5E2574]"><X className="h-5 w-5" /></button>
      <div className={`flex items-start justify-between ${headerClass}`}><div className={`flex shrink-0 items-center justify-center bg-[#F3E8FF] text-[#7E22CE] ${iconClass}`}><Sparkles className={iconSizeClass} /></div><span className={`${stepLabelClass} font-medium text-[#77718F]`}>Step {stepIndex + 1} of 7</span></div>
      {step.eyebrow && <span className="mt-5 inline-flex rounded-full bg-[#F3E8FF] px-3 py-1 text-[12px] font-bold text-[#7E22CE]">{step.eyebrow}</span>}
      <h2 id="mymagnetix-tour-title" className={`${titleWidthClass} font-bold leading-[1.1] tracking-[-0.03em] text-[#1D1B27] ${titleClass}`}>{step.title}</h2>
      <p className={`${bodyWidthClass} text-[#67627D] ${bodyClass}`}>{step.body}</p>
      <div className={`flex gap-2 ${contextual ? "mt-4 flex-row" : "mt-7 flex-col-reverse sm:flex-row sm:justify-end"}`}>{stepIndex > 0 ? <button type="button" onClick={() => setStepIndex((current) => (current === null ? 0 : current - 1))} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#DCCFEA] text-[13px] font-semibold text-[#5E2574] transition-colors hover:bg-[#FAF7FD] ${contextual ? "flex-1 px-2" : "px-5 text-[14px]"}`}><ArrowLeft className="h-4 w-4" /> Back</button> : <button type="button" onClick={() => finish("dismissed")} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#DCCFEA] px-5 text-[14px] font-semibold text-[#5E2574] transition-colors hover:bg-[#FAF7FD]">Skip for now</button>}<button type="button" onClick={next} className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-[#7E22CE] text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(126,34,206,0.22)] transition-colors hover:bg-[#6B21A8] ${contextual ? "flex-1 px-2" : "flex-1 px-6 text-[14px] sm:flex-none"}`}>{step.final ? "Start exploring" : stepIndex === 0 ? "Show me around" : "Next"}<ArrowRight className="h-4 w-4" /></button></div>
      <div className={`${contextual ? "mt-4" : "mt-6"} flex justify-center gap-1.5`} aria-label={`Tour progress: step ${stepIndex + 1} of 7`}>{STEPS.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === stepIndex ? "w-6 bg-[#7E22CE]" : "w-1.5 bg-[#E5D8F0]"}`} />)}</div>
    </div>
  );

  return <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="mymagnetix-tour-title">
    {contextual && rects.length > 0 ? <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><defs><mask id="mymagnetix-onboarding-spotlight"><rect width="100%" height="100%" fill="white" />{rects.map((rect, index) => <rect key={index} x={Math.max(6, rect.left - 6)} y={Math.max(6, rect.top - 6)} width={Math.min(viewport.width - 12, rect.width + 12)} height={Math.min(viewport.height - 12, rect.height + 12)} rx="18" fill="black" />)}</mask></defs><rect width="100%" height="100%" fill="rgba(41,32,77,0.52)" mask="url(#mymagnetix-onboarding-spotlight)" /></svg> : <div className="absolute inset-0 bg-[#29204d]/45 backdrop-blur-[1px]" />}
    {rects.map((rect, index) => <div key={`${rect.left}-${rect.top}-${index}`} className="pointer-events-none absolute rounded-[18px] border-2 shadow-[0_0_0_4px_rgba(245,196,81,0.16),0_0_26px_rgba(245,196,81,0.62)]" style={{ top: Math.max(6, rect.top - 6), left: Math.max(6, rect.left - 6), width: Math.min(viewport.width - 12, rect.width + 12), height: Math.min(viewport.height - 12, rect.height + 12), borderColor: GOLD }} />)}
    {layout.centered ? <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">{tooltip}</div> : <div className="absolute inset-0 p-3 sm:p-6" style={{ pointerEvents: "none" }}><div style={{ pointerEvents: "auto" }}>{tooltip}</div></div>}
  </div>;
}
