# Community Live — Roadmap

## Shipped (2026-09-02): pre-live media state carries into the room

`QuickGoLiveSetup`'s camera/mic on-off + device choice now actually reaches
the live room. Automatic recording (LiveKit RoomComposite egress) now starts
after that initial state is applied instead of immediately on connect, so it
no longer opens on a black/dead frame when the host had camera/mic on. See
`src/lib/community/live-prejoin-state.ts`, `quick-go-live-setup.tsx`, and
`community-live-room-client.tsx`'s `applyPrejoinMediaState`.

## FUTURE LIVE RECORDING CONTROLS — not implemented

Host-controlled recording, deliberately out of scope for the 2026-09-02
pre-join fix above. None of the following exist yet:

- **Auto Record toggle** — NOT BUILT. Recording today is all-or-nothing,
  driven by the room's existing `keepAsPost` setting (chosen once at
  room-creation time in `QuickGoLiveSetup`), not a dedicated Auto Record
  switch a host can flip mid-session.
- **Start Recording** — NOT BUILT. No in-room control exists to begin
  recording on demand once live; recording (when `keepAsPost` was set) begins
  automatically near the start of the session.
- **Stop Recording** — NOT BUILT. No in-room control exists to end recording
  before the Live itself ends; the only way recording stops today is the Live
  ending, which triggers egress completion via LiveKit's `egress_ended`
  webhook (`src/app/api/webhooks/livekit/route.ts`).
- **Recording indicator/state** — NOT BUILT. The live room UI shows no
  "Recording" badge or state to the host or attendees; `recordingStatus`
  (`processing`/`ready`) exists server-side on the room/session docs but
  nothing in `community-live-room-client.tsx` surfaces it live.

When this gets built, it needs to account for (raised, not solved, here):

- Host-only permission gating (mirrors the existing `moderator`-only check
  already enforced server-side in `live-rooms/route.ts`'s `start-recording`
  action).
- One or multiple recording segments per Live (Stop then Start again mid-
  session), vs. today's single continuous egress per session.
- Replay asset behavior when a session has multiple segments — today's
  pipeline (`community-live-recording-service.ts`) assumes exactly one
  `providerEgressId`/asset per session.
- Error/retry state if `startRoomCompositeEgress` or a mid-session
  start/stop fails — today's failure path is a generic 502 with no host-
  facing retry affordance.
