import "server-only";

import { importedContentOrigin, injectSiteShim, siteResponseCsp } from "@/lib/pages-funnels/imported-site/policy";
import { readServableSiteFile } from "@/lib/server/pages-funnels/imported-site-service";

/**
 * Imported website files (2026-11-20). Served ONLY on the separate content
 * origin — every other host (the Magnetix app included) gets a 404, so
 * imported code can never run on the app origin. Every response is
 * sandboxed by CSP (opaque origin, no forms, network only to this origin).
 */
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const origin = importedContentOrigin();
  if (!origin) return notFound();
  // Both the Host and any forwarded host must be the content origin (a
  // spoofed X-Forwarded-Host on the app domain is refused).
  const want = new URL(origin).host.toLowerCase();
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const fwd = request.headers.get("x-forwarded-host");
  if (host !== want || (fwd !== null && fwd.toLowerCase() !== want)) return notFound();
  const { path } = await ctx.params;
  if (!Array.isArray(path) || path.length < 2) return notFound();
  const [bundleId, ...rest] = path;
  const file = await readServableSiteFile(bundleId, rest.map((s) => decodeURIComponent(s)).join("/")).catch(() => null);
  if (!file) return notFound();
  const headers: Record<string, string> = {
    "Content-Type": file.contentType,
    "Content-Security-Policy": siteResponseCsp(origin),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": file.entry ? "no-store" : "public, max-age=300",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()",
  };
  if (file.entry) return new Response(injectSiteShim(file.bytes.toString("utf8")), { headers });
  return new Response(new Uint8Array(file.bytes), { headers });
}
