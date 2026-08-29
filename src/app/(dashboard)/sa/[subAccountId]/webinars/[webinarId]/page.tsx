"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Webinar, WebinarRegistrant } from "@/types/webinar";
export default function WebinarDetailPage() {
  const { subAccountId, webinarId } = useParams<{
    subAccountId: string;
    webinarId: string;
  }>();
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [registrants, setRegistrants] = useState<WebinarRegistrant[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/webinars/${webinarId}`
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Unable to load webinar.");
      return;
    }
    setWebinar(data.webinar);
    setRegistrants(data.registrants ?? []);
  }, [subAccountId, webinarId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function lifecycle(status: "live" | "ended" | "canceled") {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/webinars/${webinarId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Unable to update webinar.");
      return;
    }
    void load();
  }
  if (error) return <div className="text-destructive p-6">{error}</div>;
  if (!webinar) return <div className="p-6">Loading webinar…</div>;
  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/webinar/${subAccountId}/${webinar.slug}`;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Webinar</p>
          <h1 className="text-2xl font-semibold">{webinar.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {webinar.status} · {webinar.timezone}
          </p>
        </div>
        <div className="flex gap-2">
          {webinar.status === "scheduled" && (
            <Button onClick={() => void lifecycle("live")}>
              Start webinar
            </Button>
          )}
          {webinar.status === "live" && (
            <Button onClick={() => void lifecycle("ended")}>End webinar</Button>
          )}
        </div>
      </div>
      <div className="rounded-xl border p-5">
        <p className="text-sm">Registration URL</p>
        <code className="mt-2 block text-xs break-all">{publicUrl}</code>
        <p className="text-muted-foreground mt-4 text-sm">
          {webinar.description || "No description"}
        </p>
      </div>
      <div className="rounded-xl border p-5">
        <h2 className="font-semibold">Registrants ({registrants.length})</h2>
        {registrants.length === 0 ? (
          <p className="text-muted-foreground mt-3 text-sm">
            No registrants yet.
          </p>
        ) : (
          <div className="mt-3 divide-y">
            {registrants.map((r) => (
              <div key={r.id} className="flex justify-between py-3 text-sm">
                <span>
                  {r.firstName} {r.lastName} · {r.email}
                </span>
                <span className="text-muted-foreground">{r.attendance}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
