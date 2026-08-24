import { NextResponse } from "next/server";
import { publishCallback, qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { getSessionCookies } from "@/lib/server/skool-import/session-store";
import { getScanResultInternal, updateScanResult } from "@/lib/server/skool-import/scan-store";
import {
  runCommunityPhase,
  runMembersPhase,
  runPostsPhase,
  runCommentsBatch,
  runFinalize,
} from "@/lib/server/skool-import/scan-runner";

export const dynamic = "force-dynamic";
// A members/posts/comments-batch phase can involve a dozen-plus sequential
// headless-browser launches (see scan-runner.ts) — give real headroom.
// This project already runs other QStash steps at maxDuration=300.
export const maxDuration = 280;

type StepPhase = "community" | "members" | "posts" | "comments" | "finalize";

interface StepBody {
  importSessionId?: string;
  phase?: StepPhase;
}

/**
 * Skool Import → Scan, one phase per QStash-invoked call — same pattern as
 * the existing GHL importer's step route (public path, Upstash-Signature
 * is the only auth, idempotent/resumable work, re-enqueues itself for the
 * next phase or the next batch within a phase). Never trusts a group id
 * or cursor from the QStash body beyond `importSessionId`/`phase` — every
 * other piece of state (cookies, cursor, running totals) is re-read from
 * Firestore each call, the authoritative source.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) {
    return NextResponse.json({ error: "QStash not configured" }, { status: 503 });
  }
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await request.text();
  if (!(await verifyQStashSignature(signature, rawBody))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: StepBody;
  try {
    payload = JSON.parse(rawBody) as StepBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { importSessionId, phase } = payload;
  if (!importSessionId || !phase) {
    return NextResponse.json({ error: "Bad step payload" }, { status: 400 });
  }

  const scan = await getScanResultInternal(importSessionId);
  if (!scan) return NextResponse.json({ ok: true, stopped: true });
  if (scan.status !== "scanning") return NextResponse.json({ ok: true, stopped: scan.status });

  const cookies = await getSessionCookies(scan.subAccountId, scan.groupId, importSessionId);
  if (!cookies) {
    await updateScanResult(importSessionId, {
      status: "failed",
      "phases.community":
        scan.phases.community.status === "complete"
          ? scan.phases.community
          : { status: "error", detail: null, message: "Your Skool connection expired. Reconnect to continue." },
    });
    return NextResponse.json({ ok: true, stopped: "session-expired" });
  }

  const groupSlug = scan._internal.skoolGroupSlug;
  const schedule = (nextPhase: StepPhase, delaySeconds: number) =>
    scheduleStep(scan.subAccountId, scan.groupId, importSessionId, nextPhase, delaySeconds);

  try {
    if (phase === "community") {
      await updateScanResult(importSessionId, {
        "phases.community": { status: "scanning", detail: null, message: null },
        "phases.categories": { status: "scanning", detail: null, message: null },
        "phases.classroom": { status: "scanning", detail: null, message: null },
      });
      const result = await runCommunityPhase(cookies, groupSlug);
      await updateScanResult(importSessionId, {
        ...result.patch,
        "_internal.skoolGroupId": result.skoolGroupId,
        "_internal.categoriesById": result.categoriesById,
      });
      await schedule("members", 0);
    } else if (phase === "members") {
      await updateScanResult(importSessionId, {
        "phases.members": { status: "scanning", detail: null, message: null },
        "phases.points": { status: "scanning", detail: null, message: null },
      });
      const result = await runMembersPhase(cookies, groupSlug);
      await updateScanResult(importSessionId, result.patch);
      await schedule("posts", 1);
    } else if (phase === "posts") {
      await updateScanResult(importSessionId, {
        "phases.posts": { status: "scanning", detail: null, message: null },
        "phases.pinned": { status: "scanning", detail: null, message: null },
      });
      const result = await runPostsPhase(cookies, groupSlug, scan._internal.categoriesById);
      await updateScanResult(importSessionId, result.patch);
      if (result.commentQueue.length > 0) {
        await updateScanResult(importSessionId, {
          "phases.comments": { status: "scanning", detail: `0 / ${result.commentQueue.length} posts`, message: null },
          "phases.attachments": { status: "scanning", detail: null, message: null },
        });
        await schedule("comments", 1);
      } else {
        await updateScanResult(importSessionId, {
          "phases.comments": { status: "complete", detail: "0 posts", message: null },
          "phases.attachments": { status: "complete", detail: null, message: null },
        });
        await schedule("finalize", 1);
      }
    } else if (phase === "comments") {
      const fresh = await getScanResultInternal(importSessionId);
      if (!fresh) return NextResponse.json({ ok: true, stopped: true });
      const queue = fresh._internal.commentQueue;
      const cursor = fresh._internal.commentsCursorIndex;
      const runningTotals = {
        commentCount: fresh.content?.commentCount ?? 0,
        imageCount: fresh.attachments?.imageCount ?? 0,
        voiceCount: fresh.attachments?.voiceCount ?? 0,
        fileCount: fresh.attachments?.fileCount ?? 0,
      };
      const skoolGroupId = fresh._internal.skoolGroupId;
      if (!skoolGroupId) throw new Error("skoolGroupId missing — community phase did not complete correctly");
      const result = await runCommentsBatch(cookies, skoolGroupId, queue, cursor, runningTotals);
      await updateScanResult(importSessionId, result.patch);
      if (result.done) {
        await schedule("finalize", 1);
      } else {
        await schedule("comments", 1);
      }
    } else if (phase === "finalize") {
      await updateScanResult(importSessionId, {
        "phases.finalize": { status: "scanning", detail: null, message: null },
      });
      const fresh = await getScanResultInternal(importSessionId);
      if (!fresh) return NextResponse.json({ ok: true, stopped: true });
      const result = await runFinalize(
        cookies,
        groupSlug,
        fresh.members,
        !!fresh.verificationInitiatedAt,
      );
      await updateScanResult(importSessionId, result.patch);
      // Terminal — no further step scheduled.
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[skool-import][scan/step] phase "${phase}" failed:`, err instanceof Error ? err.message : String(err));
    // Transient — let QStash retry the SAME phase. Already-completed
    // phases are untouched (each phase's patch only writes its own
    // fields), so a retry re-does at most the one in-flight phase.
    return NextResponse.json({ error: "step failed" }, { status: 500 });
  }
}

async function scheduleStep(
  subAccountId: string,
  groupId: string,
  importSessionId: string,
  phase: StepPhase,
  delaySeconds: number,
): Promise<void> {
  await publishCallback({
    pathname: `/api/community/${subAccountId}/${groupId}/skool-import/scan/step`,
    body: { importSessionId, phase },
    delaySeconds,
    deduplicationId: `skoolscan_${importSessionId}_${phase}_${Date.now()}`,
  });
}
