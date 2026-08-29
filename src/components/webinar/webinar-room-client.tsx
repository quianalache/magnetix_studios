"use client";
import { useEffect, useState } from "react";
import {
  RoomContext,
  RoomAudioRenderer,
  VideoTrack,
  useConnectionState,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { ConnectionState, Room, Track } from "livekit-client";
import "@livekit/components-styles";

function RoomView({
  room,
  title,
  role,
}: {
  room: Room;
  title: string;
  role: string;
}) {
  const state = useConnectionState(room);
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]).filter((track): track is TrackReference => !!track.publication);
  return (
    <main className="bg-background min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="border-b pb-4">
          <p className="text-muted-foreground text-xs font-semibold tracking-widest uppercase">
            Magnetix Webinar
          </p>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-muted-foreground text-sm">
            {role} · {state === ConnectionState.Connected ? "Connected" : state}
          </p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          {tracks.length ? (
            tracks.map((track) => (
              <div
                key={`${track.participant.identity}-${track.source}`}
                className="overflow-hidden rounded-xl border bg-zinc-900"
              >
                <VideoTrack
                  trackRef={track}
                  className="aspect-video h-full w-full object-cover"
                />
                <p className="p-2 text-xs text-white">
                  {track.participant.name || track.participant.identity}
                </p>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-sm">
              Waiting for the webinar to begin.
            </div>
          )}
        </section>
        <RoomAudioRenderer />
      </div>
    </main>
  );
}
export default function WebinarRoomClient({ token }: { token: string }) {
  const [room] = useState(() => new Room());
  const [error, setError] = useState("");
  const [details, setDetails] = useState<{
    token: string;
    url: string;
    title: string;
    role: string;
  } | null>(null);
  useEffect(() => {
    void fetch(`/api/webinar/access/${token}`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Unable to join webinar.");
        setDetails(data);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Unable to join webinar.")
      );
    return () => {
      room.disconnect();
    };
  }, [room, token]);
  useEffect(() => {
    if (!details) return;
    void room
      .connect(details.url, details.token)
      .catch(() => setError("Unable to connect to the webinar room."));
  }, [details, room]);
  if (error) return <main className="text-destructive p-6">{error}</main>;
  if (!details) return <main className="p-6">Joining webinar…</main>;
  return (
    <RoomContext.Provider value={room}>
      <RoomView room={room} title={details.title} role={details.role} />
    </RoomContext.Provider>
  );
}
