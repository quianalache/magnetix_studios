"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * Public unsubscribe confirmation page for Agency Communications — the
 * agency-scope sibling of /u/[token]/page.tsx. Same client-side-POST-on-
 * mount pattern (so email-link previewers issuing HEAD/GET never trigger
 * an unsubscribe). No layout chrome — standalone page.
 */
type Status = "loading" | "ok" | "error";

export default function AgencyUnsubscribePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/u/agency/${token}`, { method: "POST" });
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Could not process unsubscribe.");
        }
        setStatus("ok");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Could not process unsubscribe.");
        setStatus("error");
      }
    })();
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-full bg-muted" />
            <h1 className="text-lg font-semibold">Working on it…</h1>
            <p className="mt-1 text-sm text-muted-foreground">Hold on while we update your preferences.</p>
          </>
        )}
        {status === "ok" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We won&apos;t send you any more emails from Magnetix Studios. This
              only affects Magnetix Studios&apos; own communications — any
              business you use Magnetix through keeps its own separate
              email preferences.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          </>
        )}
      </div>
    </main>
  );
}
