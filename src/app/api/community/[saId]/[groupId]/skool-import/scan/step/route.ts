import { NextResponse } from "next/server";
import { publishCallback, qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { getSessionCookies } from "@/lib/server/skool-import/session-store";
import { getScanResultInternal, updateScanResult } from "@/lib/server/skool-import/scan-store";
import {
  runCommunityPhase,
  runMembersBatch,
  runPostsBatch,
  runCommentsBatch,
  runFinalize,
} from "@/lib/server/skool-import/scan-runner";

export const dynamic = "force-dynamic";
// A members/posts/comments-batch phase can involve up to a dozen-plus
// sequential Skool page fetches (see scan-runner.ts) — give real headroom.
// This project already runs other QStash steps at maxDuration=300.
export const maxDuration = 280;

type StepPhase = "community" | "members" | "posts" | "comments" | "finalize";

interface StepBody {
  importSessionId?: string;
  phase?: StepPhase;
}

/** A phase gets this many consecutive failed attempts before scan/step
 *  gives up and writes a real `failed` status instead of returning another
 *  500 for QStash to retry. Ordinary transient hiccups (a flaky Skool
 *  response, a momentary browser-launch failure) recover within this;
 *  something that fails 3 times in a row is a real, surfaced problem. */
const MAX_PHASE_RETRIES = 3;

/** Never a raw Playwright/Node error — those can embed selectors, URLs, or
 *  process-level detail (e.g. "spawn ETXTBSY") that's meaningless and
 *  unsafe to show a user. One honest, generic, user-safe message per
 *  terminal phase failure. */
function sanitizedFailureMessage(phase: StepPhase): string {
  const label: Record<StepPhase, string> = {
    community: "community details",
    members: "members",
    posts: "posts",
    comments: "comments",
    finalize: "the final step",
  };
  return `We couldn't finish scanning ${label[phase]}. You can retry from where it left off.`;
}

/**
 * Skool Import → Scan, one phase (or one bounded batch within Members/
 * Posts/Comments) per QStash-invoked call — same pattern as the existing
 * GHL importer's step route (public path, Upstash-Signature is the only
 * auth, idempotent/resumable work, re-enqueues itself for the next phase or
 * the next batch within a phase). Never trusts a group id or cursor from
 * the QStash body beyond `importSessionId`/`phase` — every other piece of
 * state (cookies, cursors, running totals) is re-read from Firestore each
 * call, the authoritative source.
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

  // A cancelled/deleted/already-terminal scan makes any queued callback a
  // safe no-op — covers both a late retry after Cancel Scan and a late
  // retry after the scan already reached a terminal status on its own.
  const scan = await getScanResultInternal(importSessionId);
  if (!scan) return NextResponse.json({ ok: true, stopped: true });
  if (scan.status !== "scanning") return NextResponse.json({ ok: true, stopped: scan.status });

  const cookies = await getSessionCookies(scan.subAccountId, scan.groupId, importSessionId);
  if (!cookies) {
    await updateScanResult(importSessionId, {
      status: "failed",
      failure: {
        phase: null,
        reason: "session-expired",
        message: "Your Skool connection expired partway through. Reconnect to try again.",
        retryable: false,
      },
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

  /** Called right before moving to a NEW phase — a phase that's about to
   *  start fresh shouldn't inherit a failure streak from a phase it never
   *  ran. */
  const resetRetryCount = () => updateScanResult(importSessionId, { "_internal.phaseRetryCount": 0 });

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
      await resetRetryCount();
      await schedule("members", 0);
    } else if (phase === "members") {
      if (!scan._internal.memberTabsState) {
        await updateScanResult(importSessionId, {
          "phases.members": { status: "scanning", detail: null, message: null },
          "phases.points": { status: "scanning", detail: null, message: null },
        });
      }
      const result = await runMembersBatch(
        cookies,
        groupSlug,
        scan._internal.memberTabsState,
        scan._internal.memberRecords,
      );
      await updateScanResult(importSessionId, result.patch);
      if (result.done) {
        await resetRetryCount();
        await schedule("posts", 1);
      } else {
        await schedule("members", 1);
      }
    } else if (phase === "posts") {
      if (scan._internal.postsNextPage === 1 && Object.keys(scan._internal.postsById).length === 0) {
        await updateScanResult(importSessionId, {
          "phases.posts": { status: "scanning", detail: null, message: null },
          "phases.pinned": { status: "scanning", detail: null, message: null },
        });
      }
      const result = await runPostsBatch(
        cookies,
        groupSlug,
        scan._internal.postsNextPage,
        scan._internal.postsTotal,
        scan._internal.postsById,
      );
      await updateScanResult(importSessionId, result.patch);
      if (!result.done) {
        await schedule("posts", 1);
      } else {
        await resetRetryCount();
        const commentQueue = result.commentQueue ?? [];
        if (commentQueue.length > 0) {
          await updateScanResult(importSessionId, {
            "phases.comments": { status: "scanning", detail: `0 / ${commentQueue.length} posts`, message: null },
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
        await resetRetryCount();
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
    const message = err instanceof Error ? err.message : String(err);
    const retryCount = (scan._internal.phaseRetryCount ?? 0) + 1;
    if (retryCount >= MAX_PHASE_RETRIES) {
      console.error(
        `[skool-import][scan/step] phase "${phase}" failed ${retryCount} times, giving up:`,
        message,
      );
      await updateScanResult(importSessionId, {
        status: "failed",
        failure: {
          phase,
          reason: "phase-error",
          message: sanitizedFailureMessage(phase),
          retryable: true,
        },
        [`phases.${phase}`]: { status: "error", detail: null, message: "Couldn't finish this step." },
      });
      // Tell QStash this delivery is DONE (not retryable) — we've already
      // recorded the terminal failure ourselves; a further QStash-level
      // retry would just re-fail the same way and waste it. "Retry scan"
      // (a real user action, see scan/retry/route.ts) is how this resumes.
      return NextResponse.json({ ok: true, stopped: "phase-failed" });
    }
    console.error(`[skool-import][scan/step] phase "${phase}" failed (attempt ${retryCount}):`, message);
    await updateScanResult(importSessionId, { "_internal.phaseRetryCount": retryCount }).catch(() => {});
    // Transient — let QStash retry. Already-completed phases are untouched
    // (each phase's patch only writes its own fields), and batched phases
    // resume from their persisted cursor, so a retry re-does at most the
    // one bounded batch that was in flight.
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
