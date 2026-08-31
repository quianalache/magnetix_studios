"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Mic, MonitorUp, Settings2, Video, X } from "lucide-react";

type Source = "meeting" | "streaming";

export function QuickGoLiveSetup({
  saId,
  groupId,
  categories,
  filter,
  onClose,
  onCreated,
}: {
  saId: string;
  groupId: string;
  categories: string[];
  filter: string;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [source, setSource] = useState<Source>("meeting");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channel, setChannel] = useState(
    filter !== "All" ? filter : (categories[0] ?? "")
  );
  const [mode, setMode] = useState<"meeting" | "broadcast">("meeting");
  const [keepAsPost, setKeepAsPost] = useState(true);
  const [notifyMembers, setNotifyMembers] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [mirrorPreview, setMirrorPreview] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [previewError, setPreviewError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (source !== "meeting") return;
    let cancelled = false;
    async function startPreview() {
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraOn
            ? { deviceId: cameraId ? { exact: cameraId } : undefined }
            : false,
          audio: micOn
            ? { deviceId: microphoneId ? { exact: microphoneId } : undefined }
            : false,
        });
        if (cancelled)
          return stream.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameras(devices.filter((d) => d.kind === "videoinput"));
          setMicrophones(devices.filter((d) => d.kind === "audioinput"));
          setPreviewError("");
        }
      } catch {
        if (!cancelled)
          setPreviewError(
            "Camera or microphone permission is needed for a local preview."
          );
      }
    }
    void startPreview();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [source, cameraId, microphoneId, cameraOn, micOn]);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "live");
    const response = await fetch(
      `/api/community/${saId}/${groupId}/settings/upload`,
      { method: "POST", body: form }
    );
    const data = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    setUploading(false);
    if (!response.ok || !data.url)
      return setError(data.error ?? "Unable to upload thumbnail.");
    setThumbnailUrl(data.url);
  }
  async function startLive() {
    if (source === "streaming")
      return setError(
        "Streaming Software is not available until LiveKit Ingress/RTMP is configured for this deployment."
      );
    if (!title.trim()) return setError("Title is required.");
    if (!description.trim()) return setError("Description is required.");
    setSaving(true);
    setError("");
    const response = await fetch(
      `/api/community/${saId}/${groupId}/live-rooms`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          title,
          description,
          channel: channel || null,
          mode,
          keepAsPost,
          notifyMembers,
          thumbnailUrl: thumbnailUrl || null,
        }),
      }
    );
    const data = (await response.json()) as {
      room?: { id: string };
      error?: string;
    };
    setSaving(false);
    if (!response.ok || !data.room)
      return setError(data.error ?? "Unable to start live room.");
    onCreated(data.room.id);
  }
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-3 sm:grid sm:place-items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="go-live-setup-title"
    >
      <div
        className="w-full max-w-6xl rounded-xl border shadow-2xl"
        style={{
          backgroundColor: "var(--community-surface)",
          borderColor: "var(--community-border)",
          color: "var(--community-text)",
        }}
      >
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--community-border)" }}
        >
          <div>
            <h2 id="go-live-setup-title" className="font-semibold">
              Go Live
            </h2>
            <p
              className="text-sm"
              style={{ color: "var(--community-text-muted)" }}
            >
              Set up your live session before entering the Magnetix Live Room.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-4">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                style={{ transform: mirrorPreview ? "scaleX(-1)" : undefined }}
                autoPlay
                muted
                playsInline
                className={
                  source === "meeting" && cameraOn && !previewError
                    ? "h-full w-full object-cover"
                    : "hidden"
                }
              />
              <div
                className={
                  source === "meeting" && cameraOn && !previewError
                    ? "hidden"
                    : "grid h-full place-items-center p-6 text-center text-sm text-white"
                }
              >
                {source === "streaming" ? (
                  <div>
                    <MonitorUp className="mx-auto mb-3 h-9 w-9" />
                    <p className="font-medium">Waiting for stream…</p>
                    <p className="mt-1 text-white/70">
                      RTMP/Ingress is not configured for this Magnetix
                      deployment.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Camera className="mx-auto mb-3 h-9 w-9" />
                    <p>{previewError || "Camera is off"}</p>
                  </div>
                )}
              </div>
              <span className="absolute top-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">
                Preview · you are not live
              </span>
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input
                checked={mirrorPreview}
                onChange={(event) => setMirrorPreview(event.target.checked)}
                type="checkbox"
              />
              Mirror my preview
            </label>
            <div>
              <p className="mb-2 text-sm font-medium">Select Video Source</p>
              <div
                className="grid grid-cols-2 rounded-lg border p-1"
                style={{ borderColor: "var(--community-border)" }}
              >
                <button
                  onClick={() => setSource("meeting")}
                  className="rounded-md px-3 py-2 text-sm"
                  style={
                    source === "meeting"
                      ? {
                          backgroundColor: "var(--community-primary)",
                          color: "white",
                        }
                      : { color: "var(--community-text-muted)" }
                  }
                >
                  <Video className="mr-1 inline h-4 w-4" /> Meeting Room
                </button>
                <button
                  onClick={() => setSource("streaming")}
                  className="rounded-md px-3 py-2 text-sm"
                  style={
                    source === "streaming"
                      ? {
                          backgroundColor: "var(--community-primary)",
                          color: "white",
                        }
                      : { color: "var(--community-text-muted)" }
                  }
                >
                  <MonitorUp className="mr-1 inline h-4 w-4" /> Streaming
                  Software
                </button>
              </div>
            </div>
            {source === "meeting" ? (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCameraOn((on) => !on)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--community-border)" }}
                  >
                    <Camera className="mr-1 inline h-4 w-4" /> Camera{" "}
                    {cameraOn ? "on" : "off"}
                  </button>
                  <button
                    onClick={() => setMicOn((on) => !on)}
                    className="rounded-lg border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--community-border)" }}
                  >
                    <Mic className="mr-1 inline h-4 w-4" /> Mic{" "}
                    {micOn ? "on" : "off"}
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Camera
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={cameraId}
                      onChange={(e) => setCameraId(e.target.value)}
                    >
                      <option value="">Default camera</option>
                      {cameras.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || "Camera"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Microphone
                    <select
                      className="mt-1 w-full rounded-md border px-3 py-2"
                      value={microphoneId}
                      onChange={(e) => setMicrophoneId(e.target.value)}
                    >
                      <option value="">Default microphone</option>
                      {microphones.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || "Microphone"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: "var(--community-border)",
                    color: "var(--community-text-muted)",
                  }}
                >
                  Check that your camera and microphone are working before you
                  go live.
                </p>
              </>
            ) : (
              <div
                className="space-y-3 rounded-xl border p-4 text-sm"
                style={{ borderColor: "var(--community-border)" }}
              >
                <p className="font-medium">Streaming Software</p>
                <p style={{ color: "var(--community-text-muted)" }}>
                  Works with OBS Studio, StreamYard, vMix, Wirecast, and other
                  RTMP-compatible software once Ingress is enabled.
                </p>
                <p
                  className="rounded-md border px-3 py-2 text-xs"
                  style={{
                    borderColor: "var(--community-border)",
                    color: "var(--community-text-muted)",
                  }}
                >
                  Server URL and stream key are unavailable because this
                  deployment has no configured LiveKit Ingress/RTMP provider. No
                  credentials are generated or exposed.
                </p>
              </div>
            )}
          </section>
          <aside className="space-y-4">
            <label className="block text-sm font-medium">
              Posting to
              <select
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Entire Community</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Title
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border px-3 py-2"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span
                className="mt-1 block text-right text-xs"
                style={{ color: "var(--community-text-muted)" }}
              >
                {description.length}/500
              </span>
            </label>
            <label className="block text-sm font-medium">
              Room format
              <select
                className="mt-1 w-full rounded-md border px-3 py-2"
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="meeting">Meeting Room</option>
                <option value="broadcast">Broadcast</option>
              </select>
            </label>
            <div>
              <p className="mb-1.5 text-sm font-medium">Thumbnail</p>
              <div className="flex gap-3">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail preview"
                    className="h-16 w-28 rounded object-cover"
                  />
                ) : (
                  <div
                    className="grid h-16 w-28 place-items-center rounded border"
                    style={{ borderColor: "var(--community-border)" }}
                  >
                    <Settings2 className="h-4 w-4" />
                  </div>
                )}
                <label
                  className="cursor-pointer rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--community-border)" }}
                >
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/*"
                    onChange={(e) =>
                      e.target.files?.[0] && void upload(e.target.files[0])
                    }
                  />
                  {uploading ? "Uploading…" : "Change"}
                </label>
              </div>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--community-text-muted)" }}
              >
                Recommended: 1280 × 720
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={keepAsPost}
                onChange={(e) => setKeepAsPost(e.target.checked)}
              />{" "}
              Keep live as a post
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={notifyMembers}
                onChange={(e) => setNotifyMembers(e.target.checked)}
              />{" "}
              Notify members{" "}
              <span
                className="text-xs"
                style={{ color: "var(--community-text-muted)" }}
              >
                (delivery deferred)
              </span>
            </label>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: "var(--community-border)" }}
              >
                Cancel
              </button>
              <button
                disabled={saving || uploading || source === "streaming"}
                onClick={() => void startLive()}
                className="rounded-md px-3 py-2 text-sm text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--community-primary-action)" }}
              >
                {saving ? "Starting…" : "Start Live"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
