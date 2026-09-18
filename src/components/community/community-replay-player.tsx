"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

/** Resolves a short-lived private URL only after the existing Community post
 * access check succeeds. URLs stay in browser memory and are never stored. */
export function CommunityReplayPlayer({
  saId,
  groupId,
  postId,
  agencyGroupId,
}: {
  saId: string;
  groupId: string;
  postId: string;
  /** Agency Community — see CommunityLinkBase in routes.ts. Branches the
   *  replay-URL fetch only; everything else is scope-agnostic. */
  agencyGroupId?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const replayUrl = agencyGroupId
      ? `/api/agency/community/${agencyGroupId}/posts/${postId}/replay`
      : `/api/community/${saId}/${groupId}/posts/${postId}/replay`;
    void fetch(replayUrl)
      .then(async (response) => {
        const data = (await response.json()) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !data.url)
          throw new Error(data.error ?? "Replay is unavailable.");
        if (active) setUrl(data.url);
      })
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof Error ? cause.message : "Replay is unavailable."
          )
      );
    return () => {
      active = false;
    };
  }, [groupId, postId, saId, agencyGroupId]);
  if (error)
    return (
      <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-slate-950 px-5 text-center text-sm text-white/80">
        {error}
      </div>
    );
  if (!url)
    return (
      <div className="mb-3 flex aspect-video items-center justify-center rounded-lg bg-slate-950 text-sm text-white/75">
        Preparing replay…
      </div>
    );
  return (
    <div className="mb-3 aspect-video overflow-hidden rounded-lg bg-slate-950">
      <video
        className="h-full w-full"
        controls
        playsInline
        preload="metadata"
        src={url}
      >
        <span className="inline-flex items-center gap-2">
          <Play className="h-4 w-4" /> Your browser cannot play this replay.
        </span>
      </video>
    </div>
  );
}
