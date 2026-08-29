"use client";

import { useEffect, useState } from "react";
import {
  RoomContext,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useParticipants,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import "@livekit/components-styles";

function Tile({ track }: { track: TrackReference }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border bg-zinc-900">
      <VideoTrack trackRef={track} className="h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">
        {track.participant.name || track.participant.identity}
      </span>
    </div>
  );
}

function RoomView({
  room,
  role,
  roomId,
  saId,
  groupId,
  title,
  postId,
  moderationPath,
  endPath,
  onLeave,
}: {
  room: Room;
  role: string;
  roomId: string;
  saId: string;
  groupId: string;
  title: string;
  postId: string | null;
  moderationPath: string;
  endPath: string;
  onLeave: () => void;
}) {
  const state = useConnectionState(room);
  const participants = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter((t): t is TrackReference => !!t.publication);
  const [notice, setNotice] = useState("");
  const [hands, setHands] = useState<string[]>([]);
  const [canPublish, setCanPublish] = useState(
    room.localParticipant.permissions?.canPublish ?? false
  );
  const [comments, setComments] = useState<
    { id: string; body: string; author: { displayName: string } }[]
  >([]);
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (!postId) return;
    void fetch(`/api/community/${saId}/${groupId}/posts/${postId}/comments`)
      .then((r) => r.json())
      .then((data: { comments?: typeof comments }) =>
        setComments(data.comments ?? [])
      )
      .catch(() => {});
  }, [saId, groupId, postId]);
  useEffect(() => {
    const data = (payload: Uint8Array, participant?: { identity?: string }) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          identity?: string;
        };
        if (msg.type === "raise-hand" && msg.identity)
          setHands((v) => [...new Set([...v, msg.identity!])]);
      } catch {}
      if (participant?.identity)
        setNotice(`${participant.identity} raised their hand.`);
    };
    const permissions = () =>
      setCanPublish(room.localParticipant.permissions?.canPublish ?? false);
    room.on(RoomEvent.DataReceived, data);
    room.on(RoomEvent.ParticipantPermissionsChanged, permissions);
    return () => {
      room.off(RoomEvent.DataReceived, data);
      room.off(RoomEvent.ParticipantPermissionsChanged, permissions);
    };
  }, [room]);
  async function toggle(source: Track.Source) {
    if (!canPublish) {
      setNotice("The host must promote you before you can publish.");
      return;
    }
    try {
      if (source === Track.Source.ScreenShare)
        await room.localParticipant.setScreenShareEnabled(
          !room.localParticipant.isScreenShareEnabled
        );
      else if (source === Track.Source.Camera)
        await room.localParticipant.setCameraEnabled(
          !room.localParticipant.isCameraEnabled
        );
      else
        await room.localParticipant.setMicrophoneEnabled(
          !room.localParticipant.isMicrophoneEnabled
        );
    } catch {
      setNotice("This device action was canceled or is not supported.");
    }
  }
  async function sendComment() {
    if (!postId || !comment.trim()) return;
    const text = comment.trim();
    const response = await fetch(
      `/api/community/${saId}/${groupId}/posts/${postId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        }),
      }
    );
    if (!response.ok) {
      setNotice("Unable to send comment.");
      return;
    }
    const data = (await response.json()) as { comment?: { id: string } };
    if (data.comment)
      setComments((current) => [
        ...current,
        { id: data.comment!.id, body: text, author: { displayName: "You" } },
      ]);
    setComment("");
    void room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "comment" })),
      { reliable: true }
    );
  }
  async function moderate(
    identity: string,
    nextRole: "SPEAKER" | "ATTENDEE" | "PRESENTER"
  ) {
    const response = await fetch(moderationPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, identity, role: nextRole }),
    });
    setNotice(
      response.ok
        ? `${identity} is now ${nextRole.toLowerCase()}.`
        : "Permission change failed."
    );
  }
  async function endRoom() {
    if (!confirm("End this live room for everyone?")) return;
    await fetch(`${endPath}?roomId=${encodeURIComponent(roomId)}`, {
      method: "DELETE",
    });
    onLeave();
  }
  const host = role === "HOST" || role === "CO_HOST";
  const self = room.localParticipant;
  return (
    <main className="bg-background text-foreground min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
              Community Live
            </p>
            <h1 className="text-2xl font-semibold">{title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-full border px-3 py-1">{role}</span>
            <span>
              {state === ConnectionState.Connected ? "Connected" : state}
            </span>
            <button
              className="rounded-md bg-red-600 px-3 py-2 text-white"
              onClick={onLeave}
            >
              Leave
            </button>
          </div>
        </header>
        {notice && (
          <p className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
            {notice}
          </p>
        )}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.length ? (
            tracks.map((track) => (
              <Tile
                key={`${track.participant.identity}-${track.source}`}
                track={track}
              />
            ))
          ) : (
            <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-sm">
              Waiting for published video.
            </div>
          )}
        </section>
        <section className="flex flex-wrap gap-2">
          <button
            disabled={!canPublish}
            className="rounded-md border px-3 py-2 disabled:opacity-50"
            onClick={() => void toggle(Track.Source.Microphone)}
          >
            {self.isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          </button>
          <button
            disabled={!canPublish}
            className="rounded-md border px-3 py-2 disabled:opacity-50"
            onClick={() => void toggle(Track.Source.Camera)}
          >
            {self.isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          </button>
          <button
            disabled={!canPublish}
            className="rounded-md border px-3 py-2 disabled:opacity-50"
            onClick={() => void toggle(Track.Source.ScreenShare)}
          >
            {self.isScreenShareEnabled ? "Stop screen share" : "Share screen"}
          </button>
          <button
            className="rounded-md border px-3 py-2"
            onClick={() => {
              setNotice("Your hand is raised.");
              void self.publishData(
                new TextEncoder().encode(
                  JSON.stringify({
                    type: "raise-hand",
                    identity: self.identity,
                  })
                ),
                { reliable: true }
              );
            }}
          >
            Raise hand
          </button>
          {host && (
            <button
              className="rounded-md border border-red-300 px-3 py-2 text-red-700"
              onClick={() => void endRoom()}
            >
              End room
            </button>
          )}
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 font-semibold">Participants</h2>
          <div className="space-y-2">
            {participants.map((p) => {
              const isSelf = p.identity === self.identity;
              const publishing = p.permissions?.canPublish === true;
              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={p.identity}
                >
                  <span>
                    {p.name || p.identity}
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">
                      {isSelf ? "You" : publishing ? "Speaker" : "Viewer"}
                    </span>
                  </span>
                  {host && !isSelf && (
                    <span className="flex gap-2">
                      {hands.includes(p.identity) && (
                        <span className="text-amber-700">Raised hand</span>
                      )}
                      <button
                        className="rounded border px-2 py-1"
                        onClick={() =>
                          void moderate(
                            p.identity,
                            publishing ? "ATTENDEE" : "SPEAKER"
                          )
                        }
                      >
                        {publishing ? "Demote" : "Promote"}
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        {postId && (
          <section className="rounded-xl border p-4">
            <h2 className="mb-3 font-semibold">Live conversation</h2>
            <div className="mb-3 max-h-48 space-y-2 overflow-auto text-sm">
              {comments.map((entry) => (
                <p key={entry.id}>
                  <strong>{entry.author.displayName}:</strong>{" "}
                  <span dangerouslySetInnerHTML={{ __html: entry.body }} />
                </p>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border px-3 py-2"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Write a comment"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendComment();
                }}
              />
              <button
                className="rounded-md border px-3 py-2"
                onClick={() => void sendComment()}
              >
                Send
              </button>
            </div>
          </section>
        )}
        <RoomAudioRenderer />
      </div>
    </main>
  );
}

export default function CommunityLiveRoomClient({
  saId,
  groupId,
  roomId,
  joinPath,
  moderationPath,
  endPath,
  leaveHref,
}: {
  saId: string;
  groupId: string;
  roomId: string;
  joinPath?: string;
  moderationPath?: string;
  endPath?: string;
  leaveHref?: string;
}) {
  const [room, setRoom] = useState<Room | null>(null);
  const [info, setInfo] = useState<{
    role: string;
    title: string;
    postId: string | null;
    moderationPath: string;
    endPath: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          joinPath ?? `/api/community/${saId}/${groupId}/live-rooms`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roomId }),
          }
        );
        const data = (await response.json()) as {
          token?: string;
          url?: string;
          role?: string;
          title?: string;
          communityPostId?: string | null;
          error?: string;
        };
        if (!response.ok || !data.token || !data.url)
          throw new Error(data.error ?? "Unable to join live room.");
        const next = new Room();
        await next.connect(data.url, data.token);
        setInfo({
          role: data.role ?? "ATTENDEE",
          title: data.title ?? "Live room",
          postId: data.communityPostId ?? null,
          moderationPath:
            moderationPath ??
            `/api/community/${saId}/${groupId}/live-rooms/moderation`,
          endPath: endPath ?? `/api/community/${saId}/${groupId}/live-rooms`,
        });
        setRoom(next);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Unable to join live room."
        );
      }
    })();
  }, [saId, groupId, roomId, joinPath, moderationPath, endPath]);
  if (error)
    return (
      <main className="p-8">
        <p className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800">
          {error}
        </p>
      </main>
    );
  if (!room || !info)
    return (
      <main className="text-muted-foreground p-8 text-sm">
        Joining live room…
      </main>
    );
  return (
    <RoomContext.Provider value={room}>
      <RoomView
        room={room}
        role={info.role}
        roomId={roomId}
        saId={saId}
        groupId={groupId}
        title={info.title}
        postId={info.postId}
        moderationPath={info.moderationPath}
        endPath={info.endPath}
        onLeave={() => {
          room.disconnect();
          window.location.href = leaveHref ?? `/c/${saId}`;
        }}
      />
    </RoomContext.Provider>
  );
}
