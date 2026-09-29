import type { Metadata } from "next";
import { resolveReplay } from "@/lib/server/assets/media-share-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Video replay",
  robots: { index: false, follow: false },
  referrer: "strict-origin-when-cross-origin",
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: { title: "This link isn't valid", body: "Check that you copied the whole link, or ask the sender for a new one." },
  revoked: { title: "This replay is no longer shared", body: "The owner turned sharing off for this video." },
  expired: { title: "This replay link has expired", body: "Ask the sender for a new link." },
  unavailable: { title: "This video isn't available", body: "It may have been removed." },
  processing: { title: "This video is still processing", body: "Try again in a few minutes." },
};

/**
 * Public replay page. Every render re-validates the share (token, record,
 * expiry, revocation, asset, tenant) and embeds a freshly signed,
 * 5-minute Bunny token for that single existing video — never a course,
 * never a permanent provider URL.
 */
export default async function ReplayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await resolveReplay(token);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="w-full max-w-4xl">
        {result.ok ? (
          <>
            <div className="mb-4 flex flex-col gap-1">
              {result.brandName && <p className="text-xs font-medium tracking-wide text-neutral-400 uppercase">{result.brandName}</p>}
              <h1 className="text-2xl font-semibold text-balance">{result.title}</h1>
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-white/10">
              <iframe
                src={result.embedUrl}
                title={result.title}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl bg-neutral-900 p-8 text-center ring-1 ring-white/10">
            <h1 className="text-lg font-semibold">{MESSAGES[result.reason].title}</h1>
            <p className="mt-2 text-sm text-neutral-400">{MESSAGES[result.reason].body}</p>
          </div>
        )}
      </div>
    </main>
  );
}
