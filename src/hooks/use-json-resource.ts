"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * GET a JSON resource with explicit loading / error / reload states —
 * used by the Contact profile's server-backed sections (Submitted Forms,
 * Purchases & Access) so none of them can sit on a loading skeleton
 * forever: every failure resolves to `error`, and `reload()` retries.
 * `url === null` skips fetching (e.g. while auth is loading).
 */
export function useJsonResource<T>(url: string | null): {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [nonce, setNonce] = useState(0);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Only blank the data when the resource itself changed, so a reload
    // keeps showing the previous content until the fresh copy arrives.
    if (lastUrl.current !== url) {
      setData(null);
      lastUrl.current = url;
    }
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as T & { error?: string };
        if (!res.ok) {
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        return body as T;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
