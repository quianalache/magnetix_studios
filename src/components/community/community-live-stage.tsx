"use client";

import { useEffect, useRef, useState } from "react";
import {
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useConnectionState,
  useParticipants,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import { Play, Volume2, VolumeX } from "lucide-react";

type LiveMode = "meeting" | "broadcast";

function StageView({ room, mode }: { room: Room; mode: LiveMode }) {
  const connection = useConnectionState(room);
  useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter((track): track is TrackReference => !!track.publication);
  const [muted, setMuted] = useState(true);
  const [audioError, setAudioError] = useState("");
  const [videoBlocked, setVideoBlocked] = useState(false);
  const screenShare = tracks.find(
    (track) => track.source === Track.Source.ScreenShare
  );
  const activeSpeaker = room.activeSpeakers.find((participant) =>
    tracks.some(
      (track) =>
        track.source === Track.Source.Camera &&
        track.participant.identity === participant.identity
    )
  );
  const activeTrack =
    screenShare ??
    (activeSpeaker
      ? tracks.find(
          (track) =>
            track.source === Track.Source.Camera &&
            track.participant.identity === activeSpeaker.identity
        )
      : undefined) ??
    tracks.find((track) => track.source === Track.Source.Camera);

  async function toggleMuted() {
    if (!muted) return setMuted(true);
    try {
      await room.startAudio();
      setMuted(false);
      setAudioError("");
    } catch {
      setAudioError("Audio needs a browser interaction to start.");
    }
  }

  async function startVideo() {
    try {
      await room.startVideo();
      setVideoBlocked(false);
    } catch {
      setVideoBlocked(true);
    }
  }

  const connecting =
    connection === ConnectionState.Connecting ||
    connection === ConnectionState.Reconnecting;
  const disconnected = connection === ConnectionState.Disconnected;

  useEffect(() => {
    if (connection === ConnectionState.Connected)
      setVideoBlocked(!room.canPlaybackVideo);
  }, [connection, room]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-950 text-white">
      {activeTrack ? (
        <VideoTrack
          trackRef={activeTrack}
          className="h-full w-full object-contain"
          onCanPlay={() => setVideoBlocked(false)}
          onError={() => setVideoBlocked(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
          <span className="text-sm font-medium">
            {connecting
              ? "Connecting to live…"
              : disconnected
                ? "Live video is unavailable"
                : "Waiting for video…"}
          </span>
          {!connecting && !disconnected && (
            <span className="text-xs text-white/65">
              {mode === "broadcast"
                ? "Live audio"
                : "The host has not enabled video yet."}
            </span>
          )}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 pt-12 pb-3">
        <span className="min-w-0 truncate text-xs font-medium">
          {activeTrack?.source === Track.Source.ScreenShare
            ? `${activeTrack.participant.name || "Presenter"} is sharing their screen`
            : activeTrack?.participant.name || "Live now"}
        </span>
        <button
          type="button"
          onClick={() => void toggleMuted()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-black/65 px-2.5 py-1.5 text-xs font-medium hover:bg-black/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          aria-label={muted ? "Unmute live audio" : "Mute live audio"}
        >
          {muted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
      {videoBlocked && (
        <button
          type="button"
          onClick={() => void startVideo()}
          className="absolute inset-0 flex items-center justify-center bg-black/45"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg">
            <Play className="h-4 w-4 fill-current" /> Play live video
          </span>
        </button>
      )}
      <RoomAudioRenderer room={room} muted={muted} />
      {audioError && (
        <p className="absolute inset-x-3 top-3 rounded-md bg-black/65 px-2.5 py-1.5 text-center text-xs">
          {audioError}
        </p>
      )}
    </div>
  );
}

function ConnectedStage({
  saId,
  groupId,
  postId,
  mode,
  onEnded,
}: {
  saId: string;
  groupId: string;
  postId: string;
  mode: LiveMode;
  onEnded: () => void;
}) {
  const [room] = useState(() => new Room());
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/community/${saId}/${groupId}/posts/${postId}/live-watch`,
          { method: "POST" }
        );
        const data = (await response.json()) as {
          token?: string;
          url?: string;
          error?: string;
        };
        if (!response.ok || !data.token || !data.url) {
          if (response.status === 404) onEnded();
          throw new Error(data.error ?? "Unable to connect to live video.");
        }
        await room.connect(data.url, data.token);
        if (disposed) await room.disconnect();
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to connect to live video."
          );
      }
    })();
    return () => {
      disposed = true;
      void room.disconnect();
    };
  }, [groupId, onEnded, postId, room, saId]);
  useEffect(() => {
    let disposed = false;
    const endpoint = `/api/community/${saId}/${groupId}/posts/${postId}/live-watch`;
    const verifyStillActive = async () => {
      try {
        const response = await fetch(endpoint);
        if (!disposed && [401, 403, 404].includes(response.status)) onEnded();
      } catch {
        /* transient network failures do not end a live stage */
      }
    };
    const interval = window.setInterval(() => void verifyStillActive(), 20_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [groupId, onEnded, postId, saId]);
  if (error)
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-950 px-5 text-center text-sm text-white/80">
        {error}
      </div>
    );
  return (
    <RoomContext.Provider value={room}>
      <StageView room={room} mode={mode} />
    </RoomContext.Provider>
  );
}

/** Viewport-gated, subscribe-only playback for an active retained live post. */
export function CommunityLiveStage({
  saId,
  groupId,
  postId,
  mode,
  onEnded,
}: {
  saId: string;
  groupId: string;
  postId: string;
  mode: LiveMode;
  onEnded?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [ended, setEnded] = useState(false);
  useEffect(() => {
    const element = containerRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setNearViewport(entry.isIntersecting),
      { rootMargin: "300px 0px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={containerRef} className="mb-3">
      {ended ? (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-950 px-5 text-center text-sm text-white/80">
          This live session has ended.
        </div>
      ) : nearViewport ? (
        <ConnectedStage
          saId={saId}
          groupId={groupId}
          postId={postId}
          mode={mode}
          onEnded={() => {
            setEnded(true);
            onEnded?.();
          }}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-950 text-sm text-white/75">
          Live video loads when in view.
        </div>
      )}
    </div>
  );
}
