"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlignLeft,
  ArrowLeft,
  AtSign,
  Building2,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Copy,
  EyeOff,
  ExternalLink,
  GitBranch,
  GripVertical,
  Hash,
  Link2,
  ListChecks,
  Phone as PhoneIcon,
  Plus,
  Search,
  SeparatorHorizontal,
  Settings2,
  ShieldCheck,
  TextCursor,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  markFormSubmissionsRead,
  subscribeToForm,
  subscribeToFormSubmissions,
  updateForm,
} from "@/lib/firestore/forms";
import { FormSubmissionsList } from "@/components/forms/form-submissions-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PIPELINE_STAGES, type PipelineStageId } from "@/types/deals";
import { appearanceStyle } from "@/lib/forms/appearance";
import {
  CONDITION_OPERATOR_LABELS,
  defaultFormAppearance,
  defaultSmsConsentText,
  FONT_FAMILY_STACKS,
  type FormAppearance,
  type FormField,
  type FormFieldConditionOperator,
  type FormFieldType,
  type FormSettings,
  type FormSubmission,
  type LeadForm,
} from "@/types/forms";

/**
 * Headless HTML snippet — gives the developer a copy-pasteable unstyled
 * form + a tiny submit script that POSTs to the same /api/forms/[id]/submit
 * endpoint the iframe + hosted page use. Submissions create contacts and
 * fire automations identically; only the rendering surface changes.
 *
 * Input `name` attributes are the field's Firestore doc id. If the
 * developer wants to write their own form HTML, they can — just keep the
 * name attributes matching these ids.
 *
 * Does NOT implement conditional show/hide (`visibleIf`) — every field
 * always renders here regardless of its condition. Same reasoning as
 * page_break rendering as a plain `<hr>`: this export is meant to stay
 * simple, framework-free HTML. Avoid marking a conditionally-shown field
 * `required` if you're using this export path, since the visitor would be
 * forced to fill it in even when its condition wouldn't have shown it on
 * the hosted/embed form.
 *
 * CORS is enabled on the submit route so this works from any origin.
 */
function buildHtmlSnippet(form: LeadForm, origin: string): string {
  const apiUrl = `${origin}/api/forms/${form.id}/submit`;
  const escAttr = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const escText = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const fieldsHtml = form.fields
    .map((f) => {
      const id = `ls-${f.id}`;
      const labelText = escText(f.label) + (f.required ? " *" : "");
      const placeholder = escAttr(f.placeholder ?? "");
      const required = f.required ? " required" : "";
      const common =
        `id="${id}" name="${escAttr(f.id)}"` +
        (placeholder ? ` placeholder="${placeholder}"` : "") +
        required;

      if (f.type === "textarea") {
        return [
          `  <label for="${id}">${labelText}</label>`,
          `  <textarea ${common} rows="4"></textarea>`,
        ].join("\n");
      }
      if (f.type === "select") {
        const opts = (f.options ?? [])
          .map(
            (o) =>
              `    <option value="${escAttr(o)}">${escText(o)}</option>`,
          )
          .join("\n");
        return [
          `  <label for="${id}">${labelText}</label>`,
          `  <select ${common}>`,
          `    <option value="">Select…</option>`,
          opts,
          `  </select>`,
        ]
          .filter(Boolean)
          .join("\n");
      }
      if (f.type === "radio" || f.type === "checkboxes") {
        const inputType = f.type === "radio" ? "radio" : "checkbox";
        // Every option shares one name (the field id) — native radio-group
        // behavior submits one value; the submit script below accumulates
        // repeated checkbox names into one comma-joined string.
        const opts = (f.options ?? [])
          .map((o, idx) => {
            const optId = `${id}-${idx}`;
            return [
              `  <label for="${optId}">`,
              `    <input type="${inputType}" id="${optId}" name="${escAttr(f.id)}" value="${escAttr(o)}" />`,
              `    <span>${escText(o)}</span>`,
              `  </label>`,
            ].join("\n");
          })
          .join("\n");
        return [`  <p>${labelText}</p>`, opts].filter(Boolean).join("\n");
      }
      if (f.type === "page_break") {
        // The raw HTML export stays a single scrolling page — no real
        // multi-step JS here, just a visual divider matching what the
        // hosted/embed form treats as a step boundary.
        return `  <hr />`;
      }
      if (f.type === "hidden") {
        // No label, no visible input. data-leadstack-query-param tells the
        // submit script below which URL query param to read into .value
        // before the form is read into FormData.
        return `  <input type="hidden" id="${id}" name="${escAttr(f.id)}" data-leadstack-query-param="${escAttr(f.queryParam ?? "")}" />`;
      }
      if (f.type === "sms_consent") {
        // Checkbox with value="true" so FormData yields "true" when ticked
        // and omits it when not — matching the submit route's `=== "true"`.
        const consent = escText(f.consentText?.trim() || "");
        return [
          `  <label for="${id}">`,
          `    <input type="checkbox" id="${id}" name="${escAttr(f.id)}" value="true"${required} />`,
          `    <span>${consent}</span>`,
          `  </label>`,
        ].join("\n");
      }
      if (f.type === "text_block") {
        // Display-only — no input, no name attribute, nothing submitted.
        const heading = f.label.trim()
          ? `  <h3>${escText(f.label)}</h3>\n`
          : "";
        return `${heading}  <p>${escText(f.content?.trim() ?? "")}</p>`;
      }
      const inputType =
        f.type === "email"
          ? "email"
          : f.type === "phone"
            ? "tel"
            : f.type === "url"
              ? "url"
              : "text";
      return [
        `  <label for="${id}">${labelText}</label>`,
        `  <input type="${inputType}" ${common} />`,
      ].join("\n");
    })
    .join("\n\n");

  return `<!-- LeadStack form. Style with your own CSS — every element is unstyled. -->
<!-- Submissions create contacts and fire automations in your workspace. -->
<form data-leadstack-form="${form.id}" novalidate>
${fieldsHtml}

  <button type="submit">Send message</button>
  <p data-leadstack-status hidden></p>
</form>

<script>
(function () {
  var form = document.querySelector('[data-leadstack-form="${form.id}"]');
  if (!form) return;
  var status = form.querySelector("[data-leadstack-status]");
  var params = new URLSearchParams(window.location.search);
  form.querySelectorAll("[data-leadstack-query-param]").forEach(function (el) {
    var key = el.getAttribute("data-leadstack-query-param");
    if (key) { el.value = params.get(key) || ""; }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var values = {};
    new FormData(form).forEach(function (v, k) {
      values[k] = values.hasOwnProperty(k) ? values[k] + ", " + String(v) : String(v);
    });
    if (status) { status.hidden = false; status.textContent = "Sending…"; }
    fetch(${JSON.stringify(apiUrl)}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: values })
    })
      .then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || "Submission failed");
        if (res.body.redirectUrl) { window.location.href = res.body.redirectUrl; return; }
        form.reset();
        if (status) { status.textContent = res.body.thankYouMessage || "Thanks!"; }
      })
      .catch(function (err) {
        if (status) { status.textContent = err.message || "Error"; }
      });
  });
})();
</script>`;
}

/**
 * Popup / slide-in embed — a floating trigger button that opens the hosted
 * form (embedded via iframe, same as the plain iframe embed snippet) in an
 * overlay. Popup centers with a dimmed backdrop; slide-in anchors bottom-
 * right with no backdrop, so it doesn't block the rest of the host page.
 * Self-contained vanilla JS/CSS, same "paste before </body>" pattern as
 * the raw HTML snippet — no build step, no dependency on this app's CSS.
 */
function buildFloatingEmbedSnippet(
  form: LeadForm,
  origin: string,
  mode: "popup" | "slideIn",
): string {
  const uid = form.id;
  const a = form.settings.appearance ?? defaultFormAppearance();
  const embedUrl = `${origin}/f/${form.id}?embed=1&theme=${a.theme}&accent=${encodeURIComponent(a.accent)}`;
  const triggerLabel = form.name || "Contact us";

  const overlayStyle =
    mode === "popup"
      ? "background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:16px"
      : "background:transparent;align-items:flex-end;justify-content:flex-end;padding:16px;pointer-events:none";
  const panelStyle =
    mode === "popup"
      ? "position:relative;width:100%;max-width:480px;height:min(640px,90vh);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)"
      : "position:relative;width:360px;max-width:calc(100vw - 32px);height:520px;max-height:80vh;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25);pointer-events:auto";

  return `<!-- LeadStack ${mode === "popup" ? "popup" : "slide-in"} form embed -->
<button id="ls-float-trigger-${uid}" type="button" style="position:fixed;bottom:24px;right:24px;z-index:999998;padding:14px 22px;border:none;border-radius:999px;background:${a.accent};color:#fff;font:600 14px system-ui,-apple-system,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)">${triggerLabel}</button>
<div id="ls-float-overlay-${uid}" style="display:none;position:fixed;inset:0;z-index:999999;${overlayStyle}">
  <div style="${panelStyle}">
    <button id="ls-float-close-${uid}" type="button" aria-label="Close" style="position:absolute;top:6px;right:10px;background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:#666;z-index:1">&times;</button>
    <iframe src="${embedUrl}" style="width:100%;height:100%;border:0;background:transparent" title="${form.name.replace(/"/g, "&quot;")}"></iframe>
  </div>
</div>
<script>
(function () {
  var trigger = document.getElementById("ls-float-trigger-${uid}");
  var overlay = document.getElementById("ls-float-overlay-${uid}");
  var close = document.getElementById("ls-float-close-${uid}");
  if (!trigger || !overlay || !close) return;
  function open() { overlay.style.display = "flex"; trigger.style.display = "none"; }
  function shut() { overlay.style.display = "none"; trigger.style.display = "block"; }
  trigger.addEventListener("click", open);
  close.addEventListener("click", shut);
  ${mode === "popup" ? 'overlay.addEventListener("click", function (e) { if (e.target === overlay) shut(); });' : ""}
})();
</script>`;
}

const FIELD_TYPES: {
  value: FormFieldType;
  label: string;
  icon: typeof Type;
  /** Static Tailwind classes — avoid dynamic concatenation so JIT keeps them. */
  tone: {
    border: string;
    iconBg: string;
    iconText: string;
  };
}[] = [
  {
    value: "text",
    label: "Short text",
    icon: Type,
    tone: {
      border: "border-slate-400/30 hover:border-slate-400/60",
      iconBg: "bg-slate-500/10",
      iconText: "text-slate-600 dark:text-slate-300",
    },
  },
  {
    value: "email",
    label: "Email",
    icon: AtSign,
    tone: {
      border: "border-blue-400/30 hover:border-blue-400/60",
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-600 dark:text-blue-300",
    },
  },
  {
    value: "phone",
    label: "Phone",
    icon: PhoneIcon,
    tone: {
      border: "border-emerald-400/30 hover:border-emerald-400/60",
      iconBg: "bg-emerald-500/10",
      iconText: "text-emerald-600 dark:text-emerald-300",
    },
  },
  {
    value: "company",
    label: "Company",
    icon: Building2,
    tone: {
      border: "border-amber-400/30 hover:border-amber-400/60",
      iconBg: "bg-amber-500/10",
      iconText: "text-amber-600 dark:text-amber-300",
    },
  },
  {
    value: "textarea",
    label: "Long text",
    icon: TextCursor,
    tone: {
      border: "border-violet-400/30 hover:border-violet-400/60",
      iconBg: "bg-violet-500/10",
      iconText: "text-violet-600 dark:text-violet-300",
    },
  },
  {
    value: "select",
    label: "Dropdown",
    icon: ListChecks,
    tone: {
      border: "border-pink-400/30 hover:border-pink-400/60",
      iconBg: "bg-pink-500/10",
      iconText: "text-pink-600 dark:text-pink-300",
    },
  },
  {
    value: "radio",
    label: "Multiple choice",
    icon: CircleDot,
    tone: {
      border: "border-fuchsia-400/30 hover:border-fuchsia-400/60",
      iconBg: "bg-fuchsia-500/10",
      iconText: "text-fuchsia-600 dark:text-fuchsia-300",
    },
  },
  {
    value: "checkboxes",
    label: "Checkboxes",
    icon: CheckSquare,
    tone: {
      border: "border-rose-400/30 hover:border-rose-400/60",
      iconBg: "bg-rose-500/10",
      iconText: "text-rose-600 dark:text-rose-300",
    },
  },
  {
    value: "sms_consent",
    label: "SMS consent",
    icon: ShieldCheck,
    tone: {
      border: "border-teal-400/30 hover:border-teal-400/60",
      iconBg: "bg-teal-500/10",
      iconText: "text-teal-600 dark:text-teal-300",
    },
  },
  {
    value: "url",
    label: "Link (URL)",
    icon: Link2,
    tone: {
      border: "border-cyan-400/30 hover:border-cyan-400/60",
      iconBg: "bg-cyan-500/10",
      iconText: "text-cyan-600 dark:text-cyan-300",
    },
  },
  {
    value: "text_block",
    label: "Text / instructions",
    icon: AlignLeft,
    tone: {
      border: "border-neutral-400/30 hover:border-neutral-400/60",
      iconBg: "bg-neutral-500/10",
      iconText: "text-neutral-600 dark:text-neutral-300",
    },
  },
  {
    value: "hidden",
    label: "Hidden (UTM capture)",
    icon: EyeOff,
    tone: {
      border: "border-zinc-400/30 hover:border-zinc-400/60",
      iconBg: "bg-zinc-500/10",
      iconText: "text-zinc-600 dark:text-zinc-300",
    },
  },
  {
    value: "page_break",
    label: "Page break",
    icon: SeparatorHorizontal,
    tone: {
      border: "border-orange-400/30 hover:border-orange-400/60",
      iconBg: "bg-orange-500/10",
      iconText: "text-orange-600 dark:text-orange-300",
    },
  },
];

function typeMeta(value: FormFieldType) {
  return FIELD_TYPES.find((t) => t.value === value) ?? FIELD_TYPES[0];
}

const FIELD_TYPE_GROUPS: { label: string; types: FormFieldType[] }[] = [
  { label: "Basic", types: ["text", "email", "phone", "company", "textarea", "url"] },
  { label: "Choice", types: ["select", "radio", "checkboxes"] },
  { label: "Advanced", types: ["sms_consent", "hidden"] },
  { label: "Layout", types: ["text_block", "page_break"] },
];

const MAP_OPTIONS: { value: FormField["mapsTo"]; label: string }[] = [
  { value: null, label: "Don't map (store only)" },
  { value: "name", label: "Contact name" },
  { value: "email", label: "Contact email" },
  { value: "phone", label: "Contact phone" },
  { value: "company", label: "Company" },
  { value: "notes", label: "Initial note" },
];

const DEFAULTS_BY_TYPE: Record<
  FormFieldType,
  { label: string; placeholder: string; mapsTo: FormField["mapsTo"] }
> = {
  text: { label: "Text field", placeholder: "", mapsTo: null },
  email: { label: "Email", placeholder: "jane@example.com", mapsTo: "email" },
  phone: { label: "Phone", placeholder: "+1 555 000 0000", mapsTo: "phone" },
  company: { label: "Company", placeholder: "Acme Inc.", mapsTo: "company" },
  textarea: { label: "Message", placeholder: "", mapsTo: "notes" },
  select: { label: "Dropdown", placeholder: "", mapsTo: null },
  radio: { label: "Multiple choice", placeholder: "", mapsTo: null },
  checkboxes: { label: "Checkboxes", placeholder: "", mapsTo: null },
  sms_consent: { label: "SMS consent", placeholder: "", mapsTo: null },
  url: { label: "Link", placeholder: "https://loom.com/share/…", mapsTo: null },
  text_block: { label: "", placeholder: "", mapsTo: null },
  hidden: { label: "UTM source", placeholder: "", mapsTo: null },
  page_break: { label: "", placeholder: "", mapsTo: null },
};

function newField(type: FormFieldType = "text"): FormField {
  const d = DEFAULTS_BY_TYPE[type];
  return {
    ...(type === "sms_consent"
      ? { consentText: defaultSmsConsentText() }
      : {}),
    ...(type === "text_block"
      ? { content: "Add your instructions here…" }
      : {}),
    ...(type === "hidden" ? { queryParam: "utm_source" } : {}),
    id: `f_${Math.random().toString(36).slice(2, 9)}`,
    type,
    label: d.label,
    placeholder: d.placeholder,
    required: false,
    options: [],
    mapsTo: d.mapsTo,
  };
}

/** Read-only visual preview of a field's content inside the canvas — the
 *  same information the operator used to edit inline, now just rendered,
 *  since editing moved to the side panel. Not the real interactive public
 *  form (see PublicForm) — no state, no validation, just a stand-in. */
function CanvasFieldPreview({ field: f }: { field: FormField }) {
  const hasLogic = !!f.visibleIf;

  if (f.type === "text_block") {
    return (
      <div className="space-y-1 pr-5">
        {f.label.trim() && <p className="text-sm font-semibold">{f.label}</p>}
        <p className="whitespace-pre-line text-xs text-muted-foreground">
          {f.content?.trim() || "Instructional text…"}
        </p>
      </div>
    );
  }
  if (f.type === "hidden") {
    return (
      <div className="flex items-center gap-1.5 pr-5 text-xs text-muted-foreground">
        <EyeOff className="h-3 w-3 shrink-0" />
        Hidden — captures{" "}
        <code className="mono">?{f.queryParam || "utm_source"}</code>
      </div>
    );
  }

  return (
    <div className="space-y-1 pr-5">
      <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
        {f.label || "Untitled field"}
        {f.required && <span className="text-destructive">*</span>}
        {hasLogic && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
            <GitBranch className="h-2.5 w-2.5" /> Logic
          </span>
        )}
      </p>
      {f.type === "textarea" ? (
        <div className="h-12 rounded-md border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
          {f.placeholder}
        </div>
      ) : f.type === "select" ? (
        <div className="flex h-7 items-center justify-between rounded-md border bg-muted/40 px-2 text-xs text-muted-foreground">
          <span>{f.options[0] ?? "Choose…"}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </div>
      ) : f.type === "radio" || f.type === "checkboxes" ? (
        <div className="space-y-1">
          {(f.options.length ? f.options : ["Option"]).slice(0, 4).map((opt) => (
            <div key={opt} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={`h-3 w-3 shrink-0 border border-muted-foreground/40 ${
                  f.type === "radio" ? "rounded-full" : "rounded-sm"
                }`}
              />
              {opt}
            </div>
          ))}
        </div>
      ) : f.type === "sms_consent" ? (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <span className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border border-muted-foreground/40" />
          <span className="line-clamp-2">
            {f.consentText?.trim() || defaultSmsConsentText()}
          </span>
        </div>
      ) : (
        <div className="h-7 rounded-md border bg-muted/40 px-2 text-xs leading-7 text-muted-foreground">
          {f.placeholder}
        </div>
      )}
    </div>
  );
}

function CanvasFieldSlot({
  field,
  selected,
  dragging,
  dragOver,
  onSelect,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  field: FormField;
  selected: boolean;
  dragging: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.stopPropagation();
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      className={`group/canvas-field relative mb-1 cursor-pointer rounded-xl border-2 px-3 py-2.5 pl-8 transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : dragOver
            ? "border-primary/50"
            : "border-transparent hover:bg-muted/60"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <span className="absolute left-1.5 top-1/2 flex h-5 w-4 -translate-y-1/2 cursor-grab items-center justify-center text-muted-foreground/50 opacity-0 group-hover/canvas-field:opacity-100">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label="Remove field"
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover/canvas-field:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <CanvasFieldPreview field={field} />
    </div>
  );
}

/** Hover strip between two canvas fields — the "drag/drop into the form
 *  itself" affordance she asked for: pick a type, it lands exactly here. */
function CanvasInsertGap({
  atIndex,
  onPick,
}: {
  atIndex: number;
  onPick: (type: FormFieldType, atIndex: number) => void;
}) {
  return (
    <div className="group/gap relative h-2.5">
      <FieldTypePicker
        align="center"
        onPick={(t) => onPick(t, atIndex)}
        trigger={({ onClick, open }) => (
          <button
            type="button"
            onClick={onClick}
            aria-label="Insert field here"
            className={`absolute left-1/2 top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 bg-background text-muted-foreground transition-opacity hover:border-primary hover:text-primary group-hover/gap:opacity-100 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      />
    </div>
  );
}

/** Grouped (Basic/Choice/Advanced/Layout), searchable field-type picker —
 *  shared by the rail's "Add field" button and every canvas insert-gap.
 *  Custom popover rather than the DropdownMenu primitive so a search input
 *  can live inside it without fighting the menu's own keyboard handling. */
function FieldTypePicker({
  onPick,
  trigger,
  align = "start",
}: {
  onPick: (type: FormFieldType) => void;
  trigger: (props: { onClick: () => void; open: boolean }) => React.ReactNode;
  align?: "start" | "center";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function pick(t: FormFieldType) {
    onPick(t);
    setOpen(false);
    setQuery("");
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? FIELD_TYPES.filter((t) => t.label.toLowerCase().includes(q)) : null;

  return (
    <div ref={wrapRef} className="relative inline-block">
      {trigger({ onClick: () => setOpen((v) => !v), open })}
      {open && (
        <div
          className={`absolute z-30 mt-1.5 w-56 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg ${
            align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
          }`}
        >
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search field types…"
              className="h-7 w-full rounded-md border border-input bg-transparent pl-6 pr-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered ? (
              filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                  No matches
                </p>
              ) : (
                filtered.map((t) => (
                  <FieldTypeItem key={t.value} t={t} onClick={() => pick(t.value)} />
                ))
              )
            ) : (
              FIELD_TYPE_GROUPS.map((g) => (
                <div key={g.label} className="mb-1 last:mb-0">
                  <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </p>
                  {g.types.map((val) => (
                    <FieldTypeItem key={val} t={typeMeta(val)} onClick={() => pick(val)} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldTypeItem({
  t,
  onClick,
}: {
  t: (typeof FIELD_TYPES)[number];
  onClick: () => void;
}) {
  const Icon = t.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${t.tone.iconBg} ${t.tone.iconText}`}
      >
        <Icon className="h-3 w-3" />
      </span>
      {t.label}
    </button>
  );
}

function CanvasStepDivider({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="group/step relative my-3 flex items-center gap-2">
      <div className="h-px flex-1 border-t border-dashed border-orange-400/50" />
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-orange-600 dark:text-orange-300">
        <SeparatorHorizontal className="h-3 w-3" /> New step
      </span>
      <div className="h-px flex-1 border-t border-dashed border-orange-400/50" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove page break"
        className="absolute -right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover/step:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/** The right-side settings panel — everything that used to be permanently
 *  inline per-field now lives here, opened by selecting a field on the
 *  canvas. Field tab = content/validation; Logic tab = conditional
 *  visibility (hidden fields skip Logic entirely, same as before). */
function FieldSettingsPanel({
  form,
  field: f,
  index: i,
  panelTab,
  onPanelTabChange,
  onUpdateField,
  onClose,
}: {
  form: LeadForm;
  field: FormField;
  index: number;
  panelTab: "field" | "logic";
  onPanelTabChange: (t: "field" | "logic") => void;
  onUpdateField: (patch: Partial<FormField>) => void;
  onClose: () => void;
}) {
  const meta = typeMeta(f.type);
  const Icon = meta.icon;
  const showLogicTab = f.type !== "hidden";
  const showingField = !showLogicTab || panelTab === "field";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${meta.tone.iconBg} ${meta.tone.iconText}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {meta.label}
            </p>
            <p className="truncate text-xs font-semibold">{f.label || "Untitled field"}</p>
          </div>
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showLogicTab && (
        <div className="flex gap-1 border-b px-3 pt-2">
          <button
            type="button"
            onClick={() => onPanelTabChange("field")}
            className={`rounded-t-md px-2.5 py-1.5 text-xs font-medium ${
              showingField ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Field
          </button>
          <button
            type="button"
            onClick={() => onPanelTabChange("logic")}
            className={`flex items-center gap-1.5 rounded-t-md px-2.5 py-1.5 text-xs font-medium ${
              !showingField ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Logic
            {f.visibleIf && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {showingField ? (
          <>
            {f.type !== "text_block" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Label</Label>
                <Input
                  value={f.label}
                  onChange={(e) => onUpdateField({ label: e.target.value })}
                  placeholder="Field label"
                  className="h-8 text-sm"
                />
              </div>
            )}
            {f.type === "text_block" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Heading (optional)</Label>
                <Input
                  value={f.label}
                  onChange={(e) => onUpdateField({ label: e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Field type</Label>
              <select
                value={f.type}
                onChange={(e) => onUpdateField({ type: e.target.value as FormFieldType })}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-background text-foreground">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {f.type !== "text_block" && f.type !== "hidden" && f.type !== "sms_consent" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Placeholder</Label>
                  <Input
                    value={f.placeholder}
                    onChange={(e) => onUpdateField({ placeholder: e.target.value })}
                    placeholder="Placeholder (optional)"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Maps to contact field</Label>
                  <select
                    value={f.mapsTo ?? ""}
                    onChange={(e) =>
                      onUpdateField({ mapsTo: (e.target.value || null) as FormField["mapsTo"] })
                    }
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                  >
                    {MAP_OPTIONS.map((o) => (
                      <option key={o.label} value={o.value ?? ""} className="bg-background text-foreground">
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(f.type === "select" || f.type === "radio" || f.type === "checkboxes") && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <Hash className="h-3 w-3" /> Options · one per line
                </Label>
                <Textarea
                  rows={4}
                  value={f.options.join("\n")}
                  onChange={(e) =>
                    onUpdateField({
                      options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  className="text-sm"
                  placeholder={"Low budget\nMedium\nEnterprise"}
                />
              </div>
            )}

            {f.type === "sms_consent" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <ShieldCheck className="h-3 w-3" /> Consent text
                </Label>
                <Textarea
                  rows={4}
                  value={f.consentText ?? ""}
                  onChange={(e) => onUpdateField({ consentText: e.target.value })}
                  className="text-sm"
                  placeholder={defaultSmsConsentText()}
                />
                <p className="text-[10px] leading-snug text-muted-foreground">
                  For A2P 10DLC compliance the text must name your business and
                  include message frequency, &ldquo;message &amp; data rates may
                  apply,&rdquo; and STOP/HELP instructions. Add your Privacy
                  Policy + Terms links on the surrounding page.
                </p>
              </div>
            )}

            {f.type === "text_block" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <AlignLeft className="h-3 w-3" /> Instructional text
                </Label>
                <Textarea
                  rows={5}
                  value={f.content ?? ""}
                  onChange={(e) => onUpdateField({ content: e.target.value })}
                  className="text-sm"
                  placeholder="e.g. Record a quick Loom walking through your question, then paste the link in the field below."
                />
              </div>
            )}

            {f.type === "hidden" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1 text-xs">
                  <EyeOff className="h-3 w-3" /> URL query parameter
                </Label>
                <Input
                  value={f.queryParam ?? ""}
                  onChange={(e) => onUpdateField({ queryParam: e.target.value.trim() })}
                  placeholder="utm_source"
                  className="h-8 text-sm"
                />
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Invisible to visitors. Captures{" "}
                  <code>?{f.queryParam || "utm_source"}=…</code> from the URL on load.
                </p>
              </div>
            )}

            {f.type !== "text_block" && f.type !== "hidden" && (
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
                <Checkbox
                  checked={f.required}
                  onCheckedChange={(v) => onUpdateField({ required: !!v })}
                />
                Required
              </label>
            )}
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <GitBranch className="h-3.5 w-3.5" /> Only show this field when:
            </p>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <select
                value={f.visibleIf?.fieldId ?? ""}
                onChange={(e) => {
                  const targetId = e.target.value;
                  onUpdateField({
                    visibleIf: targetId
                      ? {
                          fieldId: targetId,
                          operator: f.visibleIf?.operator ?? "equals",
                          value: f.visibleIf?.value ?? "",
                        }
                      : null,
                  });
                }}
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
              >
                <option value="" className="bg-background text-foreground">
                  Always show
                </option>
                {form.fields
                  .slice(0, i)
                  .filter((pf) => pf.type !== "page_break" && pf.type !== "text_block")
                  .map((pf) => (
                    <option key={pf.id} value={pf.id} className="bg-background text-foreground">
                      {pf.label || "(untitled field)"}
                    </option>
                  ))}
              </select>
              {f.visibleIf && (
                <>
                  <select
                    value={f.visibleIf.operator}
                    onChange={(e) =>
                      onUpdateField({
                        visibleIf: {
                          ...f.visibleIf!,
                          operator: e.target.value as FormFieldConditionOperator,
                        },
                      })
                    }
                    className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                  >
                    {Object.entries(CONDITION_OPERATOR_LABELS).map(([op, opLabel]) => (
                      <option key={op} value={op} className="bg-background text-foreground">
                        {opLabel}
                      </option>
                    ))}
                  </select>
                  {f.visibleIf.operator !== "is_empty" &&
                    f.visibleIf.operator !== "is_filled" &&
                    (() => {
                      const target = form.fields.find((pf) => pf.id === f.visibleIf?.fieldId);
                      const targetOptions =
                        target &&
                        (target.type === "select" ||
                          target.type === "radio" ||
                          target.type === "checkboxes")
                          ? target.options
                          : null;
                      return targetOptions ? (
                        <select
                          value={f.visibleIf!.value}
                          onChange={(e) =>
                            onUpdateField({
                              visibleIf: { ...f.visibleIf!, value: e.target.value },
                            })
                          }
                          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                        >
                          <option value="" className="bg-background text-foreground">
                            Select…
                          </option>
                          {targetOptions.map((opt) => (
                            <option key={opt} value={opt} className="bg-background text-foreground">
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          value={f.visibleIf!.value}
                          onChange={(e) =>
                            onUpdateField({
                              visibleIf: { ...f.visibleIf!, value: e.target.value },
                            })
                          }
                          placeholder="Value"
                          className="h-8 text-sm"
                        />
                      );
                    })()}
                </>
              )}
            </div>
            {!f.visibleIf && (
              <p className="text-[11px] text-muted-foreground">
                Pick a field above to add a condition — this field always shows until you do.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

export default function FormBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { saPath, subAccount } = useSubAccount();
  const [form, setForm] = useState<LeadForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedTag, setCopiedTag] = useState("");
  const [tab, setTab] = useState<"build" | "settings" | "submissions">(
    searchParams.get("tab") === "submissions" ? "submissions" : "build",
  );
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  // Canvas builder — clicking a field selects it (opens the right settings
  // panel); dragging reorders it directly in the canvas. Selection resets on
  // navigating away from Build so the panel never shows stale state.
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"field" | "logic">("field");
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Clear the unread badge whenever the Submissions tab is actually viewed
  // (covers both clicking the in-page tab and landing here via ?tab=
  // submissions from the Forms list). Best-effort — a non-admin member
  // can view submissions but the form-doc write rule is admin-only, same
  // restriction as every other form edit, so this silently no-ops for them.
  useEffect(() => {
    if (tab !== "submissions" || !id) return;
    void markFormSubmissionsRead(id).catch(() => {});
  }, [tab, id]);

  useEffect(() => {
    if (authLoading || !user || !id) return;
    setLoading(true);
    const unsub = subscribeToForm(id, (f) => {
      setForm(f);
      setLoading(false);
    });
    return () => unsub();
  }, [id, user, authLoading]);

  useEffect(() => {
    if (authLoading || !user || !id) return;
    setSubmissionsLoading(true);
    const unsub = subscribeToFormSubmissions(id, (list) => {
      setSubmissions(list);
      setSubmissionsLoading(false);
    });
    return () => unsub();
  }, [id, user, authLoading]);

  if (loading)
    return (
      <div className="mx-auto w-full max-w-5xl">
        <BuilderSkeleton />
      </div>
    );
  if (!form)
    return (
      <div className="mx-auto w-full max-w-5xl">
        <NotFound />
      </div>
    );

  async function save(patch: Partial<LeadForm>) {
    if (!form) return;
    setSaving(true);
    try {
      await updateForm(form.id, patch);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(fid: string, patch: Partial<FormField>) {
    const next = form!.fields.map((f) =>
      f.id === fid ? { ...f, ...patch } : f,
    );
    save({ fields: next });
  }

  function addField(type: FormFieldType = "text", atIndex?: number) {
    const field = newField(type);
    // Seed the consent disclosure with the sub-account's business name so the
    // operator starts from compliant, branded copy (still fully editable).
    if (type === "sms_consent") {
      field.consentText = defaultSmsConsentText(subAccount?.name);
    }
    const fields = [...form!.fields];
    const insertAt = atIndex === undefined ? fields.length : atIndex;
    fields.splice(insertAt, 0, field);
    save({ fields });
    // Land straight on the new field's settings — the canvas insert affordance
    // is the point of entry, so skip the extra click to open it.
    if (type !== "page_break") {
      setSelectedFieldId(field.id);
      setPanelTab("field");
    }
  }

  function removeField(fid: string) {
    // Also clear `visibleIf` on any other field that conditioned itself on
    // this one — otherwise it's left pointing at a fieldId that no longer
    // exists, which `evaluateCondition` reads as permanently "" (silently
    // stuck hidden or shown, never what the operator intended).
    const next = form!.fields
      .filter((f) => f.id !== fid)
      .map((f) =>
        f.visibleIf?.fieldId === fid ? { ...f, visibleIf: null } : f,
      );
    save({ fields: next });
  }

  // A `visibleIf` is only ever meant to reference a field EARLIER in the
  // list (see the FormField.visibleIf doc comment) — the builder's picker
  // enforces that at selection time, but a reorder can silently turn a
  // valid backward reference into a forward one, which the public form
  // then evaluates against an unanswered ("") value forever. Shared by
  // every reorder path so none of them can reintroduce the bug.
  function stripInvalidatedVisibleIf(fields: FormField[]): FormField[] {
    const idOrder = new Map(fields.map((f, i) => [f.id, i]));
    return fields.map((f, i) => {
      if (!f.visibleIf) return f;
      const targetIdx = idOrder.get(f.visibleIf.fieldId);
      return targetIdx === undefined || targetIdx >= i
        ? { ...f, visibleIf: null }
        : f;
    });
  }

  /** Canvas drag-to-reorder — drop `fid` so it lands at `toIndex` in the resulting array. */
  function reorderField(fid: string, toIndex: number) {
    const fields = [...form!.fields];
    const fromIndex = fields.findIndex((f) => f.id === fid);
    if (fromIndex < 0 || fromIndex === toIndex) return;
    const [moved] = fields.splice(fromIndex, 1);
    fields.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, moved);
    save({ fields: stripInvalidatedVisibleIf(fields) });
  }

  function updateSettings(patch: Partial<FormSettings>) {
    save({ settings: { ...form!.settings, ...patch } });
  }

  function updateAppearance(patch: Partial<FormAppearance>) {
    const current = form!.settings.appearance ?? defaultFormAppearance();
    updateSettings({ appearance: { ...current, ...patch } });
  }

  function buildPublicUrl(forEmbed: boolean) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const a = form!.settings.appearance ?? defaultFormAppearance();
    const params = new URLSearchParams();
    if (forEmbed) {
      params.set("embed", "1");
      params.set("theme", a.theme);
      params.set("accent", a.accent);
      if (a.hideTitle) params.set("title", "0");
    }
    const qs = params.toString();
    return `${origin}/f/${form!.id}${qs ? `?${qs}` : ""}`;
  }

  function copyTag(kind: "link" | "script" | "html" | "popup" | "slideIn") {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const text =
      kind === "link"
        ? buildPublicUrl(false)
        : kind === "script"
          ? `<iframe src="${buildPublicUrl(true)}" width="100%" height="600" style="border:0;background:transparent" allowtransparency="true"></iframe>`
          : kind === "html"
            ? buildHtmlSnippet(form!, origin)
            : buildFloatingEmbedSnippet(form!, origin, kind);
    navigator.clipboard.writeText(text);
    setCopiedTag(kind);
    toast.success(
      kind === "link"
        ? "Link copied"
        : kind === "script"
          ? "Embed snippet copied"
          : kind === "html"
            ? "HTML snippet copied"
            : kind === "popup"
              ? "Popup embed copied"
              : "Slide-in embed copied",
    );
    setTimeout(() => setCopiedTag(""), 2000);
  }

  // The canvas renders the ACTUAL form appearance (its own light/dark +
  // accent), not the CRM's own dark sidebar theme — same CSS-variable
  // override the real public form page uses, so what she edits here is
  // what a visitor (and the "Preview" link) actually sees.
  const appearance = form.settings.appearance ?? defaultFormAppearance();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={saPath("/forms")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to forms
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <Input
              value={form.name}
              onChange={(e) => save({ name: e.target.value })}
              className="h-auto border-none bg-transparent px-0 text-2xl font-semibold tracking-tight shadow-none focus-visible:ring-0"
            />
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                form.enabled
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {form.enabled ? "Live" : "Paused"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {saving ? "Saving…" : "All changes saved"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => save({ enabled: !form.enabled })}
          >
            {form.enabled ? "Pause form" : "Resume form"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => copyTag("link")}>
            <Copy className="mr-1 h-3.5 w-3.5" />
            {copiedTag === "link" ? "Copied" : "Copy link"}
          </Button>
          <Button
            size="sm"
            render={
              <a
                href={`/f/${form.id}?leadstack_preview=1&leadstack_back=${encodeURIComponent(saPath(`/forms/${form.id}`))}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLink className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab("build")}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "build"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Build
        </button>
        <button
          type="button"
          onClick={() => setTab("settings")}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "settings"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Settings
        </button>
        <button
          type="button"
          onClick={() => setTab("submissions")}
          className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "submissions"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Submissions
          {form.submissionCount > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {form.submissionCount}
            </span>
          )}
        </button>
      </div>

      {tab === "submissions" && (
        <FormSubmissionsList submissions={submissions} loading={submissionsLoading} />
      )}

      {tab === "build" && (
      <div className="flex overflow-hidden rounded-2xl border bg-card" style={{ minHeight: 560 }}>
        {/* Rail — a single persistent "Add field" entry point, mirroring the
            canvas insert-gap affordance for anyone who doesn't hover a gap. */}
        <div className="flex w-14 shrink-0 flex-col items-center gap-1.5 border-r bg-muted/20 py-3">
          <FieldTypePicker
            onPick={(t) => addField(t)}
            trigger={({ onClick }) => (
              <button
                type="button"
                onClick={onClick}
                aria-label="Add field"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/15"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          />
        </div>

        {/* Canvas — the live form IS the editor. Click a field to edit it on
            the right; drag it to reorder; hover a gap to insert exactly
            there. Matches the GHL/Typeform pattern she reviewed in the
            mockup, adapted to a two-tier split (this canvas + per-field
            panel here, whole-form settings moved to their own tab). */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-muted/10 px-4 py-7 sm:px-8">
          <div
            style={appearanceStyle(appearance)}
            className="mx-auto max-w-lg rounded-2xl border bg-card p-6 text-card-foreground shadow-sm"
          >
            <p className="text-[1.5em] font-semibold">{form.name}</p>
            {form.fields.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground">
                No fields yet. Use <span className="font-medium">Add field</span> to get started.
              </div>
            ) : (
              <div className="mt-3">
                <CanvasInsertGap atIndex={0} onPick={(t, at) => addField(t, at)} />
                {form.fields.map((f, i) =>
                  f.type === "page_break" ? (
                    <div key={f.id}>
                      <CanvasStepDivider onRemove={() => removeField(f.id)} />
                      <CanvasInsertGap atIndex={i + 1} onPick={(t, at) => addField(t, at)} />
                    </div>
                  ) : (
                    <div key={f.id}>
                      <CanvasFieldSlot
                        field={f}
                        selected={selectedFieldId === f.id}
                        dragging={dragFieldId === f.id}
                        dragOver={dragOverId === f.id}
                        onSelect={() => {
                          setSelectedFieldId(f.id);
                          setPanelTab("field");
                        }}
                        onRemove={() => {
                          if (selectedFieldId === f.id) setSelectedFieldId(null);
                          removeField(f.id);
                        }}
                        onDragStart={() => setDragFieldId(f.id)}
                        onDragOver={() => setDragOverId(f.id)}
                        onDrop={() => {
                          if (dragFieldId) reorderField(dragFieldId, i);
                          setDragFieldId(null);
                          setDragOverId(null);
                        }}
                        onDragEnd={() => {
                          setDragFieldId(null);
                          setDragOverId(null);
                        }}
                      />
                      <CanvasInsertGap atIndex={i + 1} onPick={(t, at) => addField(t, at)} />
                    </div>
                  ),
                )}
              </div>
            )}
            <div
              className={`mt-5 rounded-lg py-2.5 text-center text-[1em] font-semibold ${
                appearance.buttonStyle === "outline"
                  ? "border-2 border-primary text-primary"
                  : appearance.buttonStyle === "text"
                    ? "text-primary"
                    : "bg-primary text-primary-foreground"
              }`}
            >
              Submit
            </div>
          </div>
        </div>

        {/* Settings panel — only takes up space while a field is selected,
            so the canvas gets full width the rest of the time. */}
        {selectedFieldId &&
          (() => {
            const selIndex = form.fields.findIndex((f) => f.id === selectedFieldId);
            const selField = selIndex >= 0 ? form.fields[selIndex] : null;
            if (!selField) return null;
            return (
              <FieldSettingsPanel
                form={form}
                field={selField}
                index={selIndex}
                panelTab={panelTab}
                onPanelTabChange={setPanelTab}
                onUpdateField={(patch) => updateField(selField.id, patch)}
                onClose={() => setSelectedFieldId(null)}
              />
            );
          })()}
      </div>
      )}

      {tab === "settings" && (
      <div className="mx-auto max-w-2xl space-y-4">
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">On submission</h2>
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label>Land new leads in pipeline stage</Label>
                <select
                  value={form.settings.pipelineStageId ?? ""}
                  onChange={(e) =>
                    updateSettings({
                      pipelineStageId:
                        (e.target.value || null) as PipelineStageId | null,
                    })
                  }
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                >
                  <option value="" className="bg-background text-foreground">
                    — None (contact only)
                  </option>
                  {PIPELINE_STAGES.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      className="bg-background text-foreground"
                    >
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Auto-tags (comma separated)</Label>
                <Input
                  value={form.settings.autoTags.join(", ")}
                  onChange={(e) =>
                    updateSettings({
                      autoTags: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.settings.createDeal}
                  onCheckedChange={(v) =>
                    updateSettings({ createDeal: !!v })
                  }
                />
                <span>Also open a deal</span>
              </div>
              {form.settings.createDeal && (
                <div className="space-y-2 pl-6">
                  <div className="space-y-1.5">
                    <Label>Deal title template</Label>
                    <Input
                      value={form.settings.dealTitleTemplate}
                      onChange={(e) =>
                        updateSettings({
                          dealTitleTemplate: e.target.value,
                        })
                      }
                      className="h-8 text-sm"
                      placeholder="New lead — {name}"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Use <code>{`{name}`}</code>, <code>{`{email}`}</code>,{" "}
                      <code>{`{company}`}</code> as placeholders.
                    </p>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1.5">
                      <Label>Default value</Label>
                      <Input
                        type="number"
                        value={form.settings.dealValue}
                        onChange={(e) =>
                          updateSettings({
                            dealValue: Number(e.target.value) || 0,
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Currency</Label>
                      <select
                        value={form.settings.dealCurrency}
                        onChange={(e) =>
                          updateSettings({ dealCurrency: e.target.value })
                        }
                        className="flex h-8 w-24 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                      >
                        {["USD", "AUD", "EUR", "GBP", "CAD"].map((c) => (
                          <option
                            key={c}
                            value={c}
                            className="bg-background text-foreground"
                          >
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold">After submit</h2>
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <Label>Thank-you message</Label>
                <Textarea
                  rows={3}
                  value={form.settings.thankYouMessage}
                  onChange={(e) =>
                    updateSettings({ thankYouMessage: e.target.value })
                  }
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Redirect URL (optional)</Label>
                <Input
                  value={form.settings.redirectUrl}
                  onChange={(e) =>
                    updateSettings({ redirectUrl: e.target.value })
                  }
                  placeholder="https://…"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </section>

          <EmbedAppearanceSection
            appearance={form.settings.appearance ?? defaultFormAppearance()}
            onChange={updateAppearance}
            previewUrl={buildPublicUrl(true)}
          />

          <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-5">
            <h2 className="mb-1 text-sm font-semibold">Share</h2>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Five ways to collect submissions. All flow to the same contact +
              automation pipeline.
            </p>
            <div className="space-y-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("link")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "link" ? "Link copied" : "Copy public link"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("script")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "script" ? "Embed copied" : "Copy iframe embed"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("popup")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "popup" ? "Popup copied" : "Copy popup embed"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("slideIn")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "slideIn" ? "Slide-in copied" : "Copy slide-in embed"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTag("html")}
                className="w-full justify-start"
              >
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copiedTag === "html" ? "HTML copied" : "Copy HTML snippet"}
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Popup / slide-in</strong> = a
              floating button that opens the form in an overlay — popup centers
              with a dimmed backdrop, slide-in anchors bottom-right without
              blocking the page.{" "}
              <strong className="text-foreground">HTML snippet</strong> = an
              unstyled form + tiny script your developer drops into any site.
              Style it with your own CSS; submissions still create contacts and
              fire automations here.
            </p>
          </section>
      </div>
      )}
    </div>
  );
}

function BuilderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-10 w-64 animate-pulse rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
        <div className="h-96 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    </div>
  );
}

function NotFound() {
  const { saPath } = useSubAccount();
  return (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <h2 className="text-lg font-semibold">Form not found</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been deleted.
      </p>
      <Button render={<Link href={saPath("/forms")} />} className="mt-6">
        Back to forms
      </Button>
    </div>
  );
}

const ACCENT_PRESETS: { label: string; value: string }[] = [
  { label: "Violet", value: "#7c3aed" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Blue", value: "#2563eb" },
  { label: "Emerald", value: "#10b981" },
  { label: "Rose", value: "#e11d48" },
  { label: "Amber", value: "#f59e0b" },
  { label: "Slate", value: "#475569" },
];

function EmbedAppearanceSection({
  appearance,
  onChange,
  previewUrl,
}: {
  appearance: FormAppearance;
  onChange: (patch: Partial<FormAppearance>) => void;
  previewUrl: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Embed appearance</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        How the form itself looks — theme, accent, and text size apply on
        the standalone link too, not just the iframe embed below. Hide
        chrome / hide title are the two that only make sense embedded.
      </p>
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ theme: t })}
                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  appearance.theme === t
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Text size</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onChange({ fontSize: size })}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  (appearance.fontSize ?? "md") === size
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {size === "sm" ? "Small" : size === "md" ? "Default" : "Large"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Font</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {(["system", "serif", "rounded", "mono"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onChange({ fontFamily: f })}
                style={{ fontFamily: FONT_FAMILY_STACKS[f] }}
                className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                  (appearance.fontFamily ?? "system") === f
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                Aa
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Corner radius</Label>
            <span className="text-[11px] text-muted-foreground">
              {appearance.cornerRadius ?? 10}px
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={appearance.cornerRadius ?? 10}
            onChange={(e) => onChange({ cornerRadius: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Button style</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["fill", "outline", "text"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ buttonStyle: s })}
                className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  (appearance.buttonStyle ?? "fill") === s
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Field spacing</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["compact", "comfortable", "spacious"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ fieldSpacing: s })}
                className={`rounded-lg border px-2 py-2 text-xs font-medium capitalize transition-colors ${
                  (appearance.fieldSpacing ?? "comfortable") === s
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-input bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Accent colour</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={appearance.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              aria-label="Pick accent colour"
            />
            <Input
              value={appearance.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              className="h-8 flex-1 font-mono text-xs"
              placeholder="#7c3aed"
            />
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ accent: p.value })}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition-colors ${
                  appearance.accent.toLowerCase() === p.value
                    ? "border-foreground/40"
                    : "border-input hover:bg-muted/50"
                }`}
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: p.value }}
                />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Border colour</Label>
            {appearance.borderColor && (
              <button
                type="button"
                onClick={() => onChange({ borderColor: null })}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Reset to theme default
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={appearance.borderColor ?? "#e4e4e7"}
              onChange={(e) => onChange({ borderColor: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent"
              aria-label="Pick border colour"
            />
            <p className="text-[11px] text-muted-foreground">
              {appearance.borderColor ? appearance.borderColor : "Matches theme (default)"}
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 pt-1">
          <Checkbox
            checked={appearance.hideChrome}
            onCheckedChange={(v) => onChange({ hideChrome: !!v })}
          />
          <span className="text-xs">Hide LeadStack header + footer</span>
        </label>

        <label className="flex items-center gap-2">
          <Checkbox
            checked={appearance.hideTitle}
            onCheckedChange={(v) => onChange({ hideTitle: !!v })}
          />
          <span className="text-xs">
            Hide form title (use when the host page already has a heading)
          </span>
        </label>

        <div className="space-y-1.5 pt-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Custom CSS (advanced)
          </Label>
          <Textarea
            rows={4}
            value={appearance.customCss}
            onChange={(e) => onChange({ customCss: e.target.value })}
            className="min-h-0 font-mono text-xs"
            placeholder={".ls-form { }\nbutton[type=submit] { border-radius: 999px; }"}
          />
          <p className="text-[10px] leading-snug text-muted-foreground">
            Injected after every other style on the hosted/iframe form.
            Doesn&apos;t apply to the raw HTML export snippet — style that
            one yourself, it&apos;s unstyled by design.
          </p>
        </div>

        <div className="rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="text-[11px] text-muted-foreground">Preview</p>
          <iframe
            key={`${appearance.theme}-${appearance.accent}-${appearance.fontSize}-${appearance.cornerRadius}-${appearance.buttonStyle}-${appearance.fontFamily}-${appearance.borderColor}-${appearance.fieldSpacing}-${appearance.hideChrome}`}
            src={previewUrl}
            className="mt-2 h-72 w-full rounded-md border bg-transparent"
            style={{ background: "transparent" }}
            title="Form preview"
          />
        </div>
      </div>
    </section>
  );
}
