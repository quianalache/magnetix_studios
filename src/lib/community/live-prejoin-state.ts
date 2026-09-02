"use client";

/**
 * Carries the host's pre-live camera/mic choice (QuickGoLiveSetup) across
 * into the actual live room (CommunityLiveRoomClient). The two can't share
 * React state or a prop: going live is a hard `window.location.assign`
 * navigation (see feed-view.tsx's `onCreated`), which tears down the whole
 * page — QuickGoLiveSetup's component state is gone before the room's own
 * component ever mounts. `sessionStorage` survives that (same tab, same
 * origin) without round-tripping device-id strings through the URL.
 *
 * One-shot by design: `consume` deletes the entry it reads. A later
 * refresh/rejoin of the same room falls back to the pre-existing default
 * (camera/mic off until the host manually enables them) rather than
 * silently re-forcing a choice made at room-creation time, possibly long
 * after the host adjusted their own controls mid-session.
 */

export interface LivePrejoinMediaState {
  cameraOn: boolean;
  micOn: boolean;
  cameraId: string;
  microphoneId: string;
}

function storageKey(roomId: string): string {
  return `magnetix:live-prejoin:${roomId}`;
}

export function storeLivePrejoinMediaState(
  roomId: string,
  state: LivePrejoinMediaState
): void {
  try {
    sessionStorage.setItem(storageKey(roomId), JSON.stringify(state));
  } catch {
    // Private browsing / storage disabled — the room simply falls back to
    // the pre-existing default (camera/mic off until manually enabled).
  }
}

export function consumeLivePrejoinMediaState(
  roomId: string
): LivePrejoinMediaState | null {
  const key = storageKey(roomId);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as Partial<LivePrejoinMediaState>;
    if (
      typeof parsed.cameraOn !== "boolean" ||
      typeof parsed.micOn !== "boolean"
    )
      return null;
    return {
      cameraOn: parsed.cameraOn,
      micOn: parsed.micOn,
      cameraId: typeof parsed.cameraId === "string" ? parsed.cameraId : "",
      microphoneId:
        typeof parsed.microphoneId === "string" ? parsed.microphoneId : "",
    };
  } catch {
    return null;
  }
}
