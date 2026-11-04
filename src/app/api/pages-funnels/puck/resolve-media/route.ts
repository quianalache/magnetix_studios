import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { resolveMediaVideosForPage } from "@/lib/server/page-media-resolver";

const notFound = () => NextResponse.json(null, { status: 404 });
const ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Preview support for Media Library videos (Wave 3): Preview renders the
 * editor's unsaved draft client-side, so it asks here for playback URLs of
 * the videos it references. Same rule as the live page — only this page's
 * own workspace's ready videos resolve — and the caller must be a member of
 * that workspace. Static route (no dynamic segment): no route-limit cost.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const pageId = params.get("pageId") ?? "";
  const ids = (params.get("videos") ?? "").split(",").filter((id) => ID.test(id)).slice(0, 20);
  if (!ID.test(pageId) || ids.length === 0) return notFound();
  const snap = await getAdminDb().collection("pages").doc(pageId).get();
  const page = snap.data() as { agencyId?: string; subAccountId?: string } | undefined;
  if (!page?.subAccountId) return notFound();
  const access = await requireSubAccountMember(req, page.subAccountId);
  if (access instanceof NextResponse) return notFound();
  const tree = { content: ids.map((assetId) => ({ type: "Video", props: { mediaVideo: { assetId, title: "" } } })) };
  const videos = await resolveMediaVideosForPage(page, tree);
  return NextResponse.json({ videos });
}
