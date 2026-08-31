import Link from "next/link";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Public Magnetix SaaS Signup — post-checkout landing. Stripe's success_url
 * points here with `?session_id={CHECKOUT_SESSION_ID}`. The browser
 * redirect here is NOT proof of payment and NEVER provisions or activates
 * anything by itself — only the signed Stripe webhook
 * (`handlePlatformSignupCheckoutCompleted`) does that, writing to
 * `purchases/{sessionId}`. This page only ever READS that doc, scoped by
 * the opaque, unguessable Stripe session id already in the URL — the same
 * trust model `/pay/[token]/status` uses for its own token.
 *
 * No auth, no polling endpoint: while provisioning is still in flight, a
 * plain `<meta http-equiv="refresh">` re-fetches this server component every
 * few seconds — webhook delivery is normally a second or two, so a couple
 * of silent reloads is the common case, not a real "polling UI" to build.
 */
export default async function PlatformSignupSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let status: "processing" | "provisioned" | "error" | "missing" = "missing";
  let businessName: string | null = null;

  if (sessionId) {
    const snap = await getAdminDb().collection("purchases").doc(sessionId).get();
    if (snap.exists && snap.data()?.kind === "platformSignup") {
      const data = snap.data() ?? {};
      status =
        data.status === "provisioned"
          ? "provisioned"
          : data.status === "error"
            ? "error"
            : "processing";
      businessName = (data.businessName as string | null) || null;
    }
  }

  const stillWorking = status === "processing" || status === "error";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      {stillWorking && <meta httpEquiv="refresh" content="4" />}
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        {status === "provisioned" ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-900/40">
              ✓
            </div>
            <h1 className="text-xl font-semibold">
              {businessName ? `${businessName} is ready` : "Your workspace is ready"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Payment received and your workspace is set up. Check your email
              for a link to create your login.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Go to login
            </Link>
          </>
        ) : status === "processing" ? (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
            <h1 className="text-xl font-semibold">We&apos;re setting up your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Payment was received — this usually takes just a few seconds.
              This page will update automatically. Check your email shortly
              for your login link.
            </p>
          </>
        ) : status === "error" ? (
          <>
            <h1 className="text-xl font-semibold">Still setting up your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment went through, but activating your workspace is
              taking longer than expected. We&apos;re retrying automatically —
              this page will update. If this doesn&apos;t resolve in a few
              minutes, contact support and mention this page.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">We couldn&apos;t find that checkout</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link may be incomplete. If you just completed a purchase,
              check your email — your receipt and login link are on their way.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
