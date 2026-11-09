/** Small fetch helper for the commerce admin API. Throws Error with `.fields` on 4xx. */
export async function commerceFetch<T>(subAccountId: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/sub-accounts/${subAccountId}/commerce/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error ?? "Something went wrong.") as Error & { fields?: Record<string, string>; status?: number };
    err.fields = (data as { fields?: Record<string, string> }).fields;
    err.status = res.status;
    throw err;
  }
  return data as T;
}
