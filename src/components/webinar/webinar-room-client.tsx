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
import { CalendarClock, Link2Off, Loader2, WifiOff } from "lucide-react";
import "@livekit/components-styles";
import { PublicAction, PublicStateShell, type PublicVariant } from "@/components/public/public-shell";

/** Why a join attempt stopped — from the access API's status, never its raw message. */
type JoinProblem = "invalid" | "not-open" | "connect";

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
export default function WebinarRoomClient({
  token,
  businessName,
}: {
  token: string;
  /** The host workspace's name, resolved server-side from the link. */
  businessName: string | null;
}) {
  const [room] = useState(() => new Room());
  const [problem, setProblem] = useState<JoinProblem | null>(null);
  const [details, setDetails] = useState<{
    token: string;
    url: string;
    title: string;
    role: string;
  } | null>(null);
  useEffect(() => {
    void fetch(`/api/webinar/access/${token}`, { method: "POST" })
      .then(async (res) => {
        if (res.ok) return setDetails(await res.json());
        // 401 bad signature / 404 webinar gone → the link; 403 → not live yet or registration no longer active.
        setProblem(res.status === 403 ? "not-open" : res.status === 401 || res.status === 404 ? "invalid" : "connect");
      })
      .catch(() => setProblem("connect"));
    return () => {
      room.disconnect();
    };
  }, [room, token]);
  useEffect(() => {
    if (!details) return;
    void room.connect(details.url, details.token).catch(() => setProblem("connect"));
  }, [details, room]);
  const variant: PublicVariant = businessName ? { kind: "tenant", brand: { name: businessName } } : { kind: "magnetix" };
  if (problem === "invalid")
    return (
      <PublicStateShell
        variant={variant}
        icon={Link2Off}
        title="This webinar link isn't valid"
        description="Check that you opened the whole link from your registration email, or ask the host to send it again."
      />
    );
  if (problem === "not-open")
    return (
      <PublicStateShell
        variant={variant}
        icon={CalendarClock}
        tone="brand"
        title="This webinar isn't open right now"
        description="The room opens when the webinar goes live. Come back at the start time using the link from your registration email."
        action={<PublicAction onClick={() => window.location.reload()}>Check again</PublicAction>}
      />
    );
  if (problem === "connect")
    return (
      <PublicStateShell
        variant={variant}
        icon={WifiOff}
        tone="error"
        title="We couldn't connect you to the webinar"
        description="Check your connection and try again."
        action={<PublicAction onClick={() => window.location.reload()}>Try again</PublicAction>}
      />
    );
  if (!details)
    return <PublicStateShell variant={variant} icon={Loader2} tone="brand" title="Joining webinar…" poweredBy={false} />;
  return (
    <RoomContext.Provider value={room}>
      <RoomView room={room} title={details.title} role={details.role} />
    </RoomContext.Provider>
  );
}
