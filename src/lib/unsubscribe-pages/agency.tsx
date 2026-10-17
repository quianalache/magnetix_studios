"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

/**
 * Public unsubscribe confirmation page for Agency Communications — the
 * agency-scope sibling of /u/[token]/page.tsx. Same client-side-POST-on-
 * mount pattern (so email-link previewers issuing HEAD/GET never trigger
 * an unsubscribe). No layout chrome — standalone page.
 */
type Status = "loading" | "ok" | "error";

export default function AgencyUnsubscribePage({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // The API rejected the link itself (400 bad/expired token, 404 no such
  // recipient) — as opposed to a network or server failure.
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/u/agency/${token}`, { method: "POST" });
        if (!res.ok) {
          setLinkInvalid(res.status === 400 || res.status === 404);
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

  // One public state card for every result (2026-10-16). The token carries
  // no business identity to the client, so this is the Magnetix variant.
  const variant = { kind: "magnetix" } as const;
  if (status === "loading") {
    return <PublicStateShell variant={variant} icon={Loader2} tone="brand" title="Working on it…" description="Hold on while we update your preferences." />;
  }
  if (status === "ok") {
    return (
      <PublicStateShell
        variant={variant}
        icon={CheckCircle2}
        tone="success"
        title="You're unsubscribed"
        description="We won't send you any more emails from Magnetix Studios. This only affects Magnetix Studios' own communications — any business you use Magnetix through keeps its own separate email preferences."
      />
    );
  }
  return (
    <PublicStateShell variant={variant} icon={AlertTriangle} tone="error" title={linkInvalid ? "This unsubscribe link isn't valid" : "Something went wrong"} description={linkInvalid ? "It may have expired or been copied incompletely." : errorMessage}>
      <p className="public-faint text-xs">Reply to a previous email and we&apos;ll opt you out manually.</p>
    </PublicStateShell>
  );
}
