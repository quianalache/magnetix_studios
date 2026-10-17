"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { PublicStateShell } from "@/components/public/public-shell";

/**
 * Public unsubscribe confirmation page. The page POSTs to /api/u/[token]
 * automatically on mount to flip emailOptedOut on the contact, then shows
 * a confirmation. We do this client-side so email-link previewers (which
 * issue HEAD/GET) don't accidentally opt people out.
 *
 * No layout chrome (sidebar/header) — this page renders standalone.
 */
type Status = "loading" | "ok" | "error";

export default function UnsubscribePage({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  // The API rejected the link itself (400 bad/expired token, 404 no such
  // recipient) — as opposed to a network or server failure.
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`/api/u/${token}`, { method: "POST" });
        if (!res.ok) {
          setLinkInvalid(res.status === 400 || res.status === 404);
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Could not process unsubscribe.");
        }
        setStatus("ok");
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Could not process unsubscribe.",
        );
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
        description="We won't send you any more marketing emails from this workspace. You'll still receive messages tied to things you've booked or purchased, like confirmations and reminders. If this was a mistake, reply to a previous email and we'll add you back manually."
      />
    );
  }
  return (
    <PublicStateShell variant={variant} icon={AlertTriangle} tone="error" title={linkInvalid ? "This unsubscribe link isn't valid" : "Something went wrong"} description={linkInvalid ? "It may have expired or been copied incompletely." : errorMessage}>
      <p className="public-faint text-xs">Reply to a previous email and we&apos;ll opt you out manually.</p>
    </PublicStateShell>
  );
}
