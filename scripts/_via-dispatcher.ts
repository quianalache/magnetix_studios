/**
 * Test helper (Vercel route-limit fix, 2026-09-29): call a consolidated API
 * endpoint THROUGH its group's generated `[[...path]]` dispatcher — the real
 * production entry point — with the same `(request, { params })` shape the
 * original per-endpoint route module had.
 *
 *   const shareRoute = viaDispatcher(await import(".../media-library/[[...path]]/route"), "[assetId]/share");
 *   await shareRoute.POST(req, { params: Promise.resolve({ id, assetId }) });
 */
type Ctx = { params: Promise<Record<string, string>> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dispatcher = Record<string, any>;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export function viaDispatcher(dispatcher: Dispatcher, pattern: string) {
  const segments = pattern.split("/").filter(Boolean);
  const names = new Set(segments.filter((s) => s.startsWith("[")).map((s) => s.slice(1, -1)));
  const toDispatch = async (ctx: Ctx) => {
    const p = await ctx.params;
    const parent = Object.fromEntries(Object.entries(p).filter(([k]) => !names.has(k)));
    const path = segments.map((s) => (s.startsWith("[") ? p[s.slice(1, -1)] : s));
    return { ...parent, path };
  };
  const out = {} as Record<(typeof METHODS)[number], (request: Request, ctx: Ctx) => Promise<Response>>;
  for (const m of METHODS) {
    out[m] = async (request, ctx) => dispatcher[m](request, { params: Promise.resolve(await toDispatch(ctx)) });
  }
  return out;
}
