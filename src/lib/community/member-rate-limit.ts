import "server-only";

const buckets = new Map<string, number[]>();

export function checkMemberAuthRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): boolean {
  const now = Date.now();
  const floor = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((ts) => ts > floor);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
