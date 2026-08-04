import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import type { LeadForm } from "@/types/forms";
import { PublicForm } from "@/components/forms/public-form";
import { appearanceStyle, resolveAppearance } from "@/lib/forms/appearance";

export const dynamic = "force-dynamic";

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ formId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { formId } = await params;
  const sp = await searchParams;

  const db = getAdminDb();
  const snap = await db.collection("forms").doc(formId).get();
  if (!snap.exists) notFound();
  const data = snap.data() as Omit<LeadForm, "id">;
  const form: LeadForm = { id: snap.id, ...data };

  const appearance = resolveAppearance(sp, form.settings);

  // Operator preview, set only by the builder's own "Preview" link — never
  // present for a real visitor filling out the form. Surfaces a way back
  // into the app, since an installed PWA's `target="_blank"` link doesn't
  // open a real browser tab (no chrome, no back button) — it just
  // navigates the standalone view in place, trapping the operator with no
  // way back short of force-quitting the app.
  const isPreview = sp.leadstack_preview === "1" && !appearance.embed;
  const previewBackHref =
    typeof sp.leadstack_back === "string" ? sp.leadstack_back : null;

  if (!form.enabled) {
    return (
      <>
        {isPreview && <PreviewBar backHref={previewBackHref} />}
        <FormFrame appearance={appearance}>
          <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center">
            <h1 className="text-xl font-semibold">This form is paused</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Please check back later.
            </p>
          </div>
        </FormFrame>
      </>
    );
  }

  const safe: LeadForm = {
    ...form,
    createdAt: null,
    updatedAt: null,
  };

  return (
    <>
      {isPreview && <PreviewBar backHref={previewBackHref} />}
      <FormFrame appearance={appearance}>
        <div className="w-full max-w-lg">
          {!appearance.hideChrome && (
            <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 rounded-sm bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500" />
              <span className="font-medium text-foreground">LeadStack</span>
            </div>
          )}
          <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
            {!appearance.hideTitle && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {form.name}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Fill this out and we&apos;ll be in touch shortly.
                </p>
              </>
            )}
            <div className={appearance.hideTitle ? "" : "mt-6"}>
              <PublicForm form={safe} />
            </div>
          </div>
          {!appearance.hideChrome && (
            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Powered by LeadStack
            </p>
          )}
        </div>
      </FormFrame>
      {appearance.customCss.trim() && <style>{appearance.customCss}</style>}
    </>
  );
}

/**
 * Sticky, theme-independent chrome so it reads as "app UI" rather than
 * part of the form itself, regardless of the form's own light/dark/accent
 * settings. Occupies real space in normal document flow (not `fixed`) so
 * it never overlaps the form content below it.
 */
function PreviewBar({ backHref }: { backHref: string | null }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-600/30 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
      <span>You&apos;re previewing this form — visitors never see this bar.</span>
      {backHref && (
        <a
          href={backHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-950/10 px-3 py-1 text-xs font-semibold transition-colors hover:bg-amber-950/20"
        >
          ← Back to Forms
        </a>
      )}
    </div>
  );
}

const SYSTEM_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Wraps the form with the resolved theme. Forces `html` + `body` background
 * via an inline `<style>` tag because next-themes adds `.dark` to `<html>`
 * based on the visitor's system preference, which would otherwise leak a
 * dark body background through the wrapper. CSS variable overrides on the
 * wrapper only cascade to descendants — they don't reach `body`.
 */
function FormFrame({
  appearance,
  children,
}: {
  appearance: ReturnType<typeof resolveAppearance>;
  children: React.ReactNode;
}) {
  const style = {
    ...appearanceStyle(appearance),
    ...(appearance.embed ? { "--font-sans": SYSTEM_FONT_STACK } : {}),
  };

  // Body background per mode. Embed = transparent so the host page shows
  // through. Otherwise an opaque colour matching the theme so the system
  // preference can't leak a dark/light mismatch.
  const bodyBg = appearance.embed
    ? "transparent"
    : appearance.theme === "dark"
      ? "oklch(0.145 0 0)"
      : "oklch(1 0 0)";

  const wrapperClass = appearance.embed
    ? "flex min-h-screen items-center justify-center bg-transparent p-4 font-sans text-foreground sm:p-6"
    : appearance.theme === "dark"
      ? "flex min-h-screen items-center justify-center bg-[oklch(0.145_0_0)] p-4 text-foreground sm:p-6"
      : "flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-4 text-foreground sm:p-6";

  return (
    <>
      <style>{`html, body { background: ${bodyBg} !important; background-color: ${bodyBg} !important; }`}</style>
      <div style={style} className={wrapperClass}>
        {children}
      </div>
    </>
  );
}
