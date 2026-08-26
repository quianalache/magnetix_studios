"use client";

import { useEffect, useState, type ReactNode } from "react";
import { PublicForm } from "@/components/forms/public-form";
import { defaultFormFields, defaultFormSettings } from "@/types/forms";
import type { LeadForm } from "@/types/forms";

/**
 * Presentational render helpers for the Puck POC config (config.tsx).
 * Pure Heading/Text/Button/Image render fine from either a client or server
 * context; Form specifically needs client-side fetching, so per Puck's own
 * documented pattern ("mark interactive components with use client; import
 * from separate files"), the whole file carries the directive and only
 * Form actually uses a hook — Next.js still lets a server-rendered
 * <Render> nest this file's components as client boundaries.
 */

type Alignment = "left" | "center" | "right";
type ButtonStyle = "primary" | "secondary" | "outline";

const ALIGN_CLASS: Record<Alignment, string> = { left: "text-left", center: "text-center", right: "text-right" };
const JUSTIFY_CLASS: Record<Alignment, string> = { left: "justify-start", center: "justify-center", right: "justify-end" };
const BUTTON_STYLE_CLASS: Record<ButtonStyle, string> = {
  primary: "bg-[#5E2574] text-white hover:bg-[#5E2574]/90",
  secondary: "bg-[#E8B7C8] text-[#3D1652] hover:bg-[#E8B7C8]/80",
  outline: "border border-[#5E2574] text-[#5E2574] hover:bg-[#5E2574]/10",
};

// `text` is typed `ReactNode`, not `string` -- required once the field has
// `contentEditable: true` (config.tsx). Confirmed via Puck's own docs: "Enabling
// inline text editing changes the field value in the render function from a
// string to a React node" -- Puck owns the contentEditable<->Data sync
// internally, this component just needs to stop assuming a string (no
// .toUpperCase()/string concatenation on `text`) and render it as children,
// which JSX already does for any ReactNode with zero other changes.
export function HeadingRender({ text, level, alignment }: { text: ReactNode; level: "h1" | "h2" | "h3"; alignment: Alignment }) {
  const Tag = level;
  const size = level === "h1" ? "text-4xl font-bold" : level === "h2" ? "text-3xl font-bold" : "text-2xl font-semibold";
  return <Tag className={`${size} tracking-tight ${ALIGN_CLASS[alignment]}`}>{text}</Tag>;
}

export function TextRender({ text, alignment }: { text: ReactNode; alignment: Alignment }) {
  return <p className={`whitespace-pre-wrap text-base text-gray-700 ${ALIGN_CLASS[alignment]}`}>{text}</p>;
}

export function ButtonRender({
  text,
  link,
  openInNewTab,
  style,
  alignment,
}: {
  text: string;
  link: string;
  openInNewTab: boolean;
  style: ButtonStyle;
  alignment: Alignment;
}) {
  return (
    <div className={`flex ${JUSTIFY_CLASS[alignment]}`}>
      <a
        href={link || "#"}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noreferrer" : undefined}
        className={`rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors ${BUTTON_STYLE_CLASS[style]}`}
      >
        {text}
      </a>
    </div>
  );
}

export function ImageRender({ src, alt, link }: { src: string; alt: string; link: string }) {
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element -- POC only; not the production Image renderer.
    <img src={src} alt={alt} className="h-auto w-full rounded-xl object-cover" />
  ) : (
    <div className="flex h-56 w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-sm text-gray-500">
      No image set
    </div>
  );
  return link ? <a href={link}>{img}</a> : img;
}

/** POC-only demo LeadForm — built from the SAME factories the real Forms
 *  feature uses (defaultFormFields/defaultFormSettings), so it's a
 *  realistic shape, not a hand-guessed one. Used whenever no real formId is
 *  set, so "does the real PublicForm component render/work inside Puck's
 *  iframe" can be verified without depending on any real Firestore data
 *  this session doesn't have access to. Its id ("demo-form-poc") does not
 *  exist in the real forms collection, so a submit attempt fails safely
 *  (404 from /api/forms/{id}/submit) rather than writing anything real. */
function demoLeadForm(): LeadForm {
  return {
    id: "demo-form-poc",
    name: "Puck POC Demo Form",
    slug: "puck-poc-demo-form",
    fields: defaultFormFields(),
    settings: defaultFormSettings(),
    agencyId: "poc",
    subAccountId: "poc",
    createdByUid: "poc",
    enabled: true,
    submissionCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}

export function FormRender({ formId, formName, subAccountId }: { formId: string; formName: string; subAccountId: string }) {
  const [form, setForm] = useState<LeadForm | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "not-found" | "error">("idle");

  useEffect(() => {
    if (!formId) {
      setForm(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/docs/design-prototypes/puck-poc/resolve-form?formId=${encodeURIComponent(formId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: LeadForm | null) => {
        if (cancelled) return;
        setForm(data);
        setStatus(data ? "found" : "not-found");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  if (!formId) {
    // No real form wired up -- render the demo form so PublicForm's actual
    // rendering/interactivity is still provable inside Puck's canvas.
    return (
      <div className="rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
          Demo form — no real formId set (do not submit)
        </p>
        <PublicForm form={demoLeadForm()} />
      </div>
    );
  }

  if (status === "loading" || status === "idle") {
    return <div className="flex h-24 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-500">Loading form…</div>;
  }
  if (status === "not-found") {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-red-300 bg-red-50 text-sm text-red-600">
        Form &ldquo;{formName || formId}&rdquo; not found for subAccountId &ldquo;{subAccountId}&rdquo;.
      </div>
    );
  }
  if (status === "error" || !form) {
    return <div className="flex h-24 items-center justify-center rounded-2xl border border-red-300 bg-red-50 text-sm text-red-600">Couldn&apos;t load form.</div>;
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <PublicForm form={form} />
    </div>
  );
}
