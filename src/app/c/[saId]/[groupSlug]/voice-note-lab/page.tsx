import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { communityHomeHref } from "@/lib/community/routes";
import { VoiceNoteLabClient } from "./voice-note-lab-client";

export const dynamic = "force-dynamic";

/**
 * PHASE 1 INTERNAL TEST HARNESS — not a product surface, no nav entry
 * anywhere, opaque route only (deliberately no /communities/ pretty
 * mirror, since this is meant to be deleted once Phase 1 is verified).
 * Reachable only by a moderator who knows the direct URL, same
 * authorization pattern as Community Settings (real member session +
 * `membership.role === "moderator"`, independently re-checked here, not
 * just hidden from a nav). Exists solely to prove the record -> upload ->
 * play round trip against the REAL member-auth path before any DM/Post/
 * channel integration begins.
 */
export default async function VoiceNoteLabPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, membership } = access;
  if (membership.role !== "moderator") notFound();

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  return (
    <div className="mx-auto min-h-screen max-w-2xl space-y-6 p-6" style={{ backgroundColor: "#F8F7F5" }}>
      <div>
        <Link
          href={communityHomeHref({ saId, pretty: false }, group.slug)}
          className="flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-[#202124]">
          Voice Note Lab — Phase 1 internal test
        </h1>
        <p className="mt-1 text-sm text-[#909090]">
          Not a product feature. Proves record → upload → playback end to
          end against the real member-auth path before any surface
          integration. Notes uploaded here live only in this page&apos;s
          session state — nothing is attached to a real message or post.
        </p>
      </div>

      <VoiceNoteLabClient saId={saId} brand={brand} />
    </div>
  );
}
