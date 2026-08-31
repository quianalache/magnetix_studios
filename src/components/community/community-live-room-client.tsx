"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useParticipants,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import {
  ChevronDown,
  Hand,
  MessageCircle,
  Mic,
  MonitorUp,
  Send,
  Settings,
  Users,
  Video,
  X,
} from "lucide-react";
import "@livekit/components-styles";

type Layout = "speaker" | "gallery";
type Panel = "people" | "chat" | null;
type Tab = "audio" | "video" | "general";
type Comment = { id: string; body: string; author: { displayName: string } };
const reactions = ["👍", "👏", "❤️", "😂", "😮", "😢", "😡", "🎉"];
const control =
  "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-medium hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--community-accent)]";

function name(p: Participant, self: string) {
  return `${p.name || p.identity}${p.identity === self ? " (You)" : ""}`;
}
function Tile({
  track,
  self,
  hands,
  mirror,
  selected,
}: {
  track: TrackReference;
  self: string;
  hands: string[];
  mirror: boolean;
  selected?: boolean;
}) {
  const mine = track.participant.identity === self;
  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-xl border bg-black ${selected ? "border-[var(--community-accent)] ring-2 ring-[var(--community-accent)]/30" : "border-white/10"}`}
    >
      <VideoTrack
        trackRef={track}
        className="h-full w-full object-contain"
        style={
          mine && mirror && track.source === Track.Source.Camera
            ? { transform: "scaleX(-1)" }
            : undefined
        }
      />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 px-3 pt-7 pb-2 text-xs text-white">
        <span>
          {name(track.participant, self)}
          {track.source === Track.Source.ScreenShare ? " · Screen share" : ""}
        </span>
        <span>
          {hands.includes(track.participant.identity) ? "✋" : ""}
          {track.source === Track.Source.Camera &&
          !track.participant.isMicrophoneEnabled
            ? " 🔇"
            : ""}
        </span>
      </div>
    </div>
  );
}

function View({
  room,
  role,
  roomId,
  saId,
  groupId,
  title,
  postId,
  mode,
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
  mode: "meeting" | "broadcast";
  moderationPath: string;
  endPath: string;
  onLeave: () => void;
}) {
  const people = useParticipants();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter((x): x is TrackReference => !!x.publication);
  const self = room.localParticipant;
  const host = role === "HOST" || role === "CO_HOST";
  const [layout, setLayout] = useState<Layout>("speaker"),
    [panel, setPanel] = useState<Panel>(null),
    [tab, setTab] = useState<Tab | null>(null),
    [menu, setMenu] = useState(false),
    [reacting, setReacting] = useState(false),
    [hands, setHands] = useState<string[]>([]),
    [flash, setFlash] = useState(""),
    [canPublish, setCanPublish] = useState(
      self.permissions?.canPublish ?? false
    ),
    [mirror, setMirror] = useState(true),
    [comments, setComments] = useState<Comment[]>([]),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const cameraTrack = self.getTrackPublication(Track.Source.Camera)?.track;
  const active = useMemo(
    () =>
      tracks.find((x) => x.source === Track.Source.ScreenShare) ??
      tracks.find((x) =>
        room.activeSpeakers.some((p) => p.identity === x.participant.identity)
      ) ??
      tracks[0],
    [room.activeSpeakers, tracks]
  );
  useEffect(() => {
    const updated = () => setCanPublish(self.permissions?.canPublish ?? false);
    room.on(RoomEvent.ParticipantPermissionsChanged, updated);
    return () => {
      room.off(RoomEvent.ParticipantPermissionsChanged, updated);
    };
  }, [room, self]);
  useEffect(() => {
    if (postId)
      void fetch(`/api/community/${saId}/${groupId}/posts/${postId}/comments`)
        .then((r) => r.json())
        .then((x: { comments?: Comment[] }) => setComments(x.comments ?? []))
        .catch(() => {});
  }, [postId, saId, groupId]);
  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then(setDevices)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const receive = (payload: Uint8Array) => {
      try {
        const x = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          identity?: string;
          emoji?: string;
        };
        if (x.type === "raise-hand" && x.identity)
          setHands((v) => [...new Set([...v, x.identity!])]);
        if (x.type === "lower-hand" && x.identity)
          setHands((v) => v.filter((id) => id !== x.identity));
        if (x.type === "reaction" && x.emoji) {
          setFlash(x.emoji);
          setTimeout(() => setFlash(""), 1800);
        }
      } catch {}
    };
    room.on(RoomEvent.DataReceived, receive);
    return () => {
      room.off(RoomEvent.DataReceived, receive);
    };
  }, [room]);
  const data = (x: object) =>
    void self.publishData(new TextEncoder().encode(JSON.stringify(x)), {
      reliable: true,
    });
  async function media(source: Track.Source) {
    if (!canPublish)
      return setNotice("The host must promote you before you can publish.");
    try {
      if (source === Track.Source.ScreenShare)
        await self.setScreenShareEnabled(!self.isScreenShareEnabled);
      else if (source === Track.Source.Camera)
        await self.setCameraEnabled(!self.isCameraEnabled);
      else await self.setMicrophoneEnabled(!self.isMicrophoneEnabled);
    } catch {
      setNotice("This device action was canceled or is unsupported.");
    }
  }
  function hand() {
    const raised = hands.includes(self.identity);
    setHands((v) =>
      raised
        ? v.filter((id) => id !== self.identity)
        : [...new Set([...v, self.identity])]
    );
    data({
      type: raised ? "lower-hand" : "raise-hand",
      identity: self.identity,
    });
  }
  async function send() {
    if (!postId || !message.trim()) return;
    const body = message.trim();
    const r = await fetch(
      `/api/community/${saId}/${groupId}/posts/${postId}/comments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: `<p>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
        }),
      }
    );
    if (!r.ok) return setNotice("Unable to send message.");
    const x = (await r.json()) as { comment?: { id: string } };
    if (x.comment)
      setComments((v) => [
        ...v,
        { id: x.comment!.id, body, author: { displayName: "You" } },
      ]);
    setMessage("");
  }
  async function moderate(identity: string, next: "SPEAKER" | "ATTENDEE") {
    const r = await fetch(moderationPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, identity, role: next }),
    });
    setNotice(
      r.ok
        ? `${identity} is now ${next === "SPEAKER" ? "a speaker" : "an attendee"}.`
        : "Permission change failed."
    );
  }
  async function end() {
    if (!confirm("End this live session for everyone?")) return;
    const r = await fetch(`${endPath}?roomId=${encodeURIComponent(roomId)}`, {
      method: "DELETE",
    });
    if (r.ok) onLeave();
    else setNotice("Unable to end the session.");
  }
  const list = people.filter((p) =>
    `${p.name} ${p.identity}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <main className="min-h-screen bg-[var(--community-bg,#0b1020)] p-2 text-[var(--community-text,#fff)] sm:p-4">
      <div className="mx-auto flex min-h-[calc(100vh-1rem)] max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-[var(--community-border,#ffffff22)] bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[.18em] text-[var(--community-accent,#c084fc)] uppercase">
              Community Live
            </p>
            <h1 className="truncate text-sm font-semibold sm:text-base">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-500/20 px-2 py-1 font-bold text-emerald-300">
              ● LIVE
            </span>
            <span className="hidden rounded-full bg-white/10 px-2 py-1 sm:inline">
              {people.length} watching
            </span>
            <div className="relative">
              <button
                className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1.5"
                onClick={() => setMenu(!menu)}
              >
                View <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {menu && (
                <div className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-white/15 bg-slate-900 p-1 shadow-xl">
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/10"
                    onClick={() => {
                      setLayout("speaker");
                      setMenu(false);
                    }}
                  >
                    Speaker View
                  </button>
                  <button
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/10"
                    onClick={() => {
                      setLayout("gallery");
                      setMenu(false);
                    }}
                  >
                    Gallery View
                  </button>
                </div>
              )}
            </div>
            <button
              className="rounded-lg border border-red-400/40 px-2 py-1.5 text-red-200"
              onClick={host ? () => void end() : onLeave}
            >
              {host ? "End Session" : "Leave"}
            </button>
          </div>
        </header>
        {notice && (
          <p className="mx-3 mt-3 rounded-lg bg-[var(--community-primary-action,#7c3aed)]/25 p-2 text-sm">
            {notice}
          </p>
        )}
        <div className="flex min-h-0 flex-1">
          <section className="relative flex min-w-0 flex-1 flex-col p-3 sm:p-5">
            <div
              className={`min-h-0 flex-1 ${layout === "gallery" ? "grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-3"}`}
            >
              {tracks.length ? (
                layout === "gallery" ? (
                  tracks.map((x) => (
                    <Tile
                      key={`${x.participant.identity}-${x.source}`}
                      track={x}
                      self={self.identity}
                      hands={hands}
                      mirror={mirror}
                    />
                  ))
                ) : (
                  <>
                    <div className="min-h-0 flex-1">
                      {active && (
                        <Tile
                          track={active}
                          self={self.identity}
                          hands={hands}
                          mirror={mirror}
                          selected
                        />
                      )}
                    </div>
                    {tracks.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto">
                        {tracks
                          .filter((x) => x !== active)
                          .map((x) => (
                            <div
                              className="w-44 shrink-0"
                              key={`${x.participant.identity}-${x.source}`}
                            >
                              <Tile
                                track={x}
                                self={self.identity}
                                hands={hands}
                                mirror={mirror}
                              />
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )
              ) : (
                <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/20 text-sm text-slate-400">
                  Waiting for camera or screen share.
                </div>
              )}
            </div>
            {flash && (
              <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-6xl">
                {flash}
              </span>
            )}
          </section>
          {panel && (
            <aside className="flex w-full shrink-0 flex-col border-l border-white/10 bg-slate-900/95 sm:w-80">
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <h2 className="font-semibold">
                  {panel === "chat"
                    ? "Live chat"
                    : mode === "broadcast"
                      ? `Audience (${people.length})`
                      : `Participants (${people.length})`}
                </h2>
                <button onClick={() => setPanel(null)}>
                  <X />
                </button>
              </div>
              {panel === "people" ? (
                <>
                  <div className="p-3">
                    <input
                      className="w-full rounded-lg border border-white/15 bg-slate-950 p-2 text-sm"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search participants"
                    />
                  </div>
                  <div className="min-h-0 flex-1 space-y-1 overflow-auto px-3">
                    {list.map((p) => {
                      const speaking = p.permissions?.canPublish;
                      return (
                        <div
                          className="rounded-lg p-2 hover:bg-white/5"
                          key={p.identity}
                        >
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="truncate">
                              {name(p, self.identity)}
                            </span>
                            <span>
                              {hands.includes(p.identity) ? "✋" : ""}
                              {speaking ? " 🎙" : ""}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-xs text-slate-400">
                            <span>
                              {p.identity === self.identity
                                ? role
                                : speaking
                                  ? "Speaker"
                                  : "Viewer"}
                            </span>
                            {host && p.identity !== self.identity && (
                              <button
                                className="rounded border border-white/15 px-2 py-1 text-slate-200"
                                onClick={() =>
                                  void moderate(
                                    p.identity,
                                    speaking ? "ATTENDEE" : "SPEAKER"
                                  )
                                }
                              >
                                {speaking ? "Demote" : "Promote"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
                    {postId ? (
                      comments.map((x) => (
                        <div className="text-sm" key={x.id}>
                          <b>{x.author.displayName}</b>
                          <p
                            className="text-slate-300"
                            dangerouslySetInnerHTML={{ __html: x.body }}
                          />
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-400">
                        This session has no live post, so durable chat is
                        unavailable.
                      </p>
                    )}
                  </div>
                  {postId && (
                    <div className="flex gap-2 border-t border-white/10 p-3">
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-950 p-2 text-sm"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void send();
                        }}
                        placeholder="Type a message"
                      />
                      <button
                        className="rounded-lg bg-[var(--community-primary-action,#7c3aed)] px-3"
                        onClick={() => void send()}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
        <footer className="flex justify-center gap-1 border-t border-white/10 px-2 py-2 text-white sm:gap-3">
          {canPublish && (
            <>
              <button
                className={control}
                onClick={() => void media(Track.Source.Microphone)}
              >
                <Mic className="h-5 w-5" />
                Audio
              </button>
              <button
                className={control}
                onClick={() => void media(Track.Source.Camera)}
              >
                <Video className="h-5 w-5" />
                Video
              </button>
            </>
          )}
          <button
            className={control}
            onClick={() => setPanel(panel === "people" ? null : "people")}
          >
            <Users className="h-5 w-5" />
            {mode === "broadcast" ? "Audience" : "People"}
          </button>
          <button
            className={control}
            onClick={() => setPanel(panel === "chat" ? null : "chat")}
          >
            <MessageCircle className="h-5 w-5" />
            Chat
          </button>
          <div className="relative">
            <button className={control} onClick={() => setReacting(!reacting)}>
              ☺<span>React</span>
            </button>
            {reacting && (
              <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 rounded-xl border border-white/15 bg-slate-900 p-1">
                {reactions.map((x) => (
                  <button
                    className="p-1 text-lg"
                    key={x}
                    onClick={() => {
                      data({ type: "reaction", emoji: x });
                      setFlash(x);
                      setReacting(false);
                    }}
                  >
                    {x}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={control} onClick={hand}>
            <Hand className="h-5 w-5" />
            {hands.includes(self.identity) ? "Lower" : "Raise"}
          </button>
          {canPublish && (
            <button
              className={control}
              onClick={() => void media(Track.Source.ScreenShare)}
            >
              <MonitorUp className="h-5 w-5" />
              Share
            </button>
          )}
          <button className={control} onClick={() => setTab("audio")}>
            <Settings className="h-5 w-5" />
            Settings
          </button>
        </footer>
      </div>
      {tab && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/65 p-4">
          <section className="w-full max-w-2xl rounded-2xl border border-white/15 bg-slate-900 text-white">
            <header className="flex justify-between border-b border-white/10 p-4">
              <b>Settings</b>
              <button onClick={() => setTab(null)}>
                <X />
              </button>
            </header>
            <div className="grid sm:grid-cols-[150px_1fr]">
              <nav className="flex gap-1 border-b border-white/10 p-3 sm:flex-col sm:border-r sm:border-b-0">
                {(["audio", "video", "general"] as Tab[]).map((x) => (
                  <button
                    className={`rounded-lg px-3 py-2 text-left capitalize ${tab === x ? "bg-[var(--community-primary-action,#7c3aed)]/25" : ""}`}
                    key={x}
                    onClick={() => setTab(x)}
                  >
                    {x}
                  </button>
                ))}
              </nav>
              <div className="min-h-72 p-5">
                {tab === "audio" && (
                  <>
                    <h3>Audio</h3>
                    <label className="mt-4 block text-sm">
                      Microphone
                      <select
                        className="mt-1 w-full rounded border border-white/15 bg-slate-950 p-2"
                        onChange={(e) =>
                          void room.switchActiveDevice(
                            "audioinput",
                            e.target.value
                          )
                        }
                      >
                        {devices
                          .filter((d) => d.kind === "audioinput")
                          .map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || "Microphone"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="mt-5 text-xs text-slate-400">
                      Input level, speaker testing, noise suppression, and Hi-Fi
                      need provider/browser capability not configured here.
                    </p>
                  </>
                )}
                {tab === "video" && (
                  <>
                    <h3>Video</h3>
                    <div className="mt-4 aspect-video overflow-hidden rounded-xl bg-black">
                      {cameraTrack?.mediaStreamTrack ? (
                        <video
                          autoPlay
                          muted
                          playsInline
                          className="h-full w-full object-contain"
                          ref={(el) => {
                            if (el)
                              el.srcObject = new MediaStream([
                                cameraTrack.mediaStreamTrack,
                              ]);
                          }}
                          style={
                            mirror ? { transform: "scaleX(-1)" } : undefined
                          }
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-sm text-slate-400">
                          Camera is off
                        </div>
                      )}
                    </div>
                    <label className="mt-4 flex justify-between rounded-lg border border-white/10 p-3 text-sm">
                      Mirror my preview{" "}
                      <input
                        type="checkbox"
                        checked={mirror}
                        onChange={(e) => setMirror(e.target.checked)}
                      />
                    </label>
                    <label className="mt-4 block text-sm">
                      Camera
                      <select
                        className="mt-1 w-full rounded border border-white/15 bg-slate-950 p-2"
                        onChange={(e) =>
                          void room.switchActiveDevice(
                            "videoinput",
                            e.target.value
                          )
                        }
                      >
                        {devices
                          .filter((d) => d.kind === "videoinput")
                          .map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label || "Camera"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <p className="mt-4 text-xs text-slate-400">
                      Mirroring is local CSS only. Background effects are
                      deferred because no safe media-processing pipeline is
                      installed.
                    </p>
                  </>
                )}
                {tab === "general" && (
                  <>
                    <h3>General</h3>
                    <div className="mt-4 space-y-3 text-sm">
                      <p>
                        Room format: <b className="capitalize">{mode}</b> (fixed
                        once live)
                      </p>
                      <p>
                        Chat:{" "}
                        {postId
                          ? "durable Community discussion"
                          : "unavailable without a live post"}
                      </p>
                      <p>Reactions: enabled</p>
                    </div>
                    <p className="mt-5 text-xs text-slate-400">
                      Changing Meeting/Broadcast in-room is intentionally
                      unavailable so server-authorized grants stay safe.
                    </p>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      <RoomAudioRenderer />
    </main>
  );
}

export default function CommunityLiveRoomClient({
  saId,
  groupId,
  roomId,
  moderationPath = `/api/community/${saId}/${groupId}/live-rooms/moderation`,
  endPath = `/api/community/${saId}/${groupId}/live-rooms`,
  joinPath = `/api/community/${saId}/${groupId}/live-rooms`,
  leaveHref = `/c/${saId}`,
}: {
  saId: string;
  groupId: string;
  roomId: string;
  moderationPath?: string;
  endPath?: string;
  joinPath?: string;
  leaveHref?: string;
}) {
  const [room, setRoom] = useState<Room | null>(null),
    [info, setInfo] = useState<{
      role: string;
      title: string;
      postId: string | null;
      mode: "meeting" | "broadcast";
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await fetch(joinPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
        const x = (await r.json()) as {
          token?: string;
          url?: string;
          role?: string;
          title?: string;
          communityPostId?: string | null;
          mode?: "meeting" | "broadcast";
          error?: string;
        };
        if (!r.ok || !x.token || !x.url)
          throw new Error(x.error ?? "Unable to join live room.");
        const next = new Room();
        await next.connect(x.url, x.token);
        if (!active) return next.disconnect();
        setInfo({
          role: x.role ?? "ATTENDEE",
          title: x.title ?? "Live room",
          postId: x.communityPostId ?? null,
          mode: x.mode === "broadcast" ? "broadcast" : "meeting",
        });
        setRoom(next);
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Unable to join live room."
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [joinPath, roomId]);
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
      <View
        room={room}
        role={info.role}
        roomId={roomId}
        saId={saId}
        groupId={groupId}
        title={info.title}
        postId={info.postId}
        mode={info.mode}
        moderationPath={moderationPath}
        endPath={endPath}
        onLeave={() => {
          room.disconnect();
          window.location.href = leaveHref;
        }}
      />
    </RoomContext.Provider>
  );
}
