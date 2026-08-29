"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function PublicWebinarPage() {
  const { subAccountId, webinarSlug } = useParams<{
    subAccountId: string;
    webinarSlug: string;
  }>();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    title: string;
    joinToken: string;
    joinUrl: string;
  } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch(
      `/api/webinar/${subAccountId}/${webinarSlug}/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Unable to register.");
      return;
    }
    setResult({
      title: data.webinar.title,
      joinToken: data.joinToken,
      joinUrl: data.joinUrl,
    });
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
      <div className="bg-card w-full space-y-6 rounded-2xl border p-8 shadow-sm">
        {result ? (
          <>
            <p className="text-muted-foreground text-sm">
              Registration confirmed
            </p>
            <h1 className="text-3xl font-semibold">{result.title}</h1>
            <p className="text-muted-foreground text-sm">
              You are registered. The join button becomes available when the
              webinar is live.
            </p>
            <a
              className="bg-primary text-primary-foreground inline-flex rounded-md px-4 py-2 text-sm"
              href={result.joinUrl}
            >
              Open secure join page
            </a>
            <p className="text-muted-foreground text-xs break-all">
              Keep this page open to join when the host starts.
            </p>
          </>
        ) : (
          <>
            <div>
              <p className="text-muted-foreground text-sm">Magnetix Webinar</p>
              <h1 className="mt-1 text-3xl font-semibold">
                Register for this webinar
              </h1>
            </div>
            <form className="space-y-4" onSubmit={(e) => void submit(e)}>
              <Input
                required
                placeholder="First name"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
              />
              <Input
                required
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
              <Input
                required
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {message && <p className="text-destructive text-sm">{message}</p>}
              <Button type="submit">Register</Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
