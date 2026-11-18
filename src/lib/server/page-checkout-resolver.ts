import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { CheckoutError } from "@/lib/server/checkout/common";
import { getCheckoutConfigDoc } from "@/lib/server/checkout/config-service";
import { buildCheckoutView } from "@/lib/server/checkout/view-service";
import { AUTO_CHECKOUT_KEY, isCheckoutConfigId, type CheckoutBlockPayload, type CheckoutStepContext } from "@/lib/pages-funnels/checkout-block";

/**
 * Page Builder Checkout block resolution (Checkout Foundation Phase 3).
 *
 * Which Checkout Steps a page's block may connect to: the Funnel Checkout
 * Steps of THIS page's own workspace — never another workspace's, never an
 * arbitrary Offer. Preferred: the funnel(s) this page belongs to; a page
 * that is the Checkout Step's own page connects automatically.
 */
export async function checkoutContextsForPage(
  subAccountId: string,
  pageId: string,
): Promise<{ contexts: CheckoutStepContext[]; autoConfigId: string | null; pageInFunnel: boolean; pageFunnelIds: string[]; pageSteps: PageFunnelStepRef[] }> {
  const db = getAdminDb();
  const funnels = (await db.collection("funnels").where("subAccountId", "==", subAccountId).get()).docs.filter((f) => f.data().status !== "archived");
  const all: Array<CheckoutStepContext & { pageInFunnel: boolean }> = [];
  const pageFunnels: string[] = [];
  const pageSteps: PageFunnelStepRef[] = [];
  for (const f of funnels) {
    const steps = (await db.collection(`funnels/${f.id}/steps`).get()).docs.map((d) => ({ id: d.id, ...(d.data() as { name: string; type: string; order: number; pageId: string | null; checkoutConfigId: string | null }) }));
    const pageInFunnel = steps.some((s) => s.pageId === pageId);
    if (pageInFunnel) pageFunnels.push(f.id);
    for (const s of steps) {
      if (s.pageId !== pageId) continue;
      pageSteps.push({ funnelId: f.id, funnelName: (f.data().name as string) || "Untitled funnel", funnelStatus: (f.data().status as string) ?? "draft", stepId: s.id, stepName: s.name || "Step", stepType: s.type });
    }
    for (const s of steps.sort((a, b) => a.order - b.order)) {
      if (s.type !== "checkout" || !s.checkoutConfigId) continue;
      all.push({
        configId: s.checkoutConfigId,
        funnelId: f.id,
        funnelName: (f.data().name as string) || "Untitled funnel",
        funnelStatus: (f.data().status as string) ?? "draft",
        stepId: s.id,
        stepName: s.name || "Checkout",
        linkedToPage: s.pageId === pageId,
        primaryOfferTitle: null,
        pageInFunnel,
      });
    }
  }
  const inFunnel = all.filter((c) => c.pageInFunnel);
  const linked = all.find((c) => c.linkedToPage) ?? null;
  // Prefer the funnel(s) this page is part of; otherwise any Checkout Step
  // in the workspace (still Checkout Steps — never bare Offers).
  const contexts: CheckoutStepContext[] = (inFunnel.length ? inFunnel : all).map((c) => ({
    configId: c.configId,
    funnelId: c.funnelId,
    funnelName: c.funnelName,
    funnelStatus: c.funnelStatus,
    stepId: c.stepId,
    stepName: c.stepName,
    linkedToPage: c.linkedToPage,
    primaryOfferTitle: c.primaryOfferTitle,
  }));
  const autoConfigId = linked?.configId ?? (inFunnel.length === 1 ? inFunnel[0].configId : null);
  // Every (non-archived) funnel that uses this page in one of its steps —
  // including funnels without a Checkout Step.
  const pageFunnelIds = [...new Set(pageFunnels)];
  return { contexts, autoConfigId, pageInFunnel: inFunnel.length > 0, pageFunnelIds, pageSteps };
}

/** A funnel step that shows this page (Page-first funnels: lets the builder offer "use this page for checkout / as a one-click offer"). */
export interface PageFunnelStepRef {
  funnelId: string;
  funnelName: string;
  funnelStatus: string;
  stepId: string;
  stepName: string;
  stepType: string;
}

/**
 * Resolve the page's Checkout blocks. `key` is a config id or "auto".
 * A config resolves only when it is a Funnel Checkout Step of the page's
 * own workspace. `mode: "published"` builds the public view (unpublished
 * funnels / unavailable Offers → null, so visitors see nothing broken);
 * "editor" builds the safe preview view (drafts allowed, never payable).
 *
 * Funnel context (Saved Page Templates, 2026-11-16, owner decision): on a page
 * that belongs to a funnel, a block whose stored connection is a Checkout Step
 * of a DIFFERENT funnel never sells that funnel's Offer. It resolves through
 * this page's own funnel Checkout instead (the automatic connection); when the
 * page's funnel has none, it gets the ordinary missing-configuration state.
 * The stored value is kept (the editor explains what happened and lets the
 * creator pick a Checkout Step). A page in no funnel keeps its explicit
 * connection — the intentional standalone embed.
 */
export async function resolveCheckoutBlocks(
  page: { id: string; subAccountId: string | null | undefined },
  keys: string[],
  mode: "published" | "editor",
): Promise<Record<string, CheckoutBlockPayload | null>> {
  const out: Record<string, CheckoutBlockPayload | null> = {};
  if (!page.subAccountId || keys.length === 0) return out;
  const { contexts, autoConfigId, pageFunnelIds } = await checkoutContextsForPage(page.subAccountId, page.id);
  const describe = async (configId: string, config: NonNullable<Awaited<ReturnType<typeof getCheckoutConfigDoc>>>): Promise<CheckoutStepContext> => {
    const known = contexts.find((c) => c.configId === configId);
    if (known) return known;
    if (config.context.type !== "funnel_step") throw new Error("not a funnel step");
    const funnel = (await getAdminDb().doc(`funnels/${config.context.funnelId}`).get()).data();
    const step = (await getAdminDb().doc(`funnels/${config.context.funnelId}/steps/${config.context.stepId}`).get()).data();
    return {
      configId,
      funnelId: config.context.funnelId,
      funnelName: (funnel?.name as string) || "Untitled funnel",
      funnelStatus: (funnel?.status as string) ?? "draft",
      stepId: config.context.stepId,
      stepName: (step?.name as string) || "Checkout",
      linkedToPage: step?.pageId === page.id,
      primaryOfferTitle: null,
    };
  };
  for (const key of keys.slice(0, 5)) {
    let configId = key === AUTO_CHECKOUT_KEY ? autoConfigId : isCheckoutConfigId(key) ? key : null;
    if (!configId) {
      out[key] = null;
      continue;
    }
    let config = await getCheckoutConfigDoc(configId);
    if (!config || config.subAccountId !== page.subAccountId || config.context.type !== "funnel_step") {
      out[key] = null;
      continue;
    }
    let replaced: CheckoutStepContext | null = null;
    if (key !== AUTO_CHECKOUT_KEY && pageFunnelIds.length > 0 && !pageFunnelIds.includes(config.context.funnelId)) {
      replaced = await describe(configId, config);
      const own = autoConfigId ? await getCheckoutConfigDoc(autoConfigId) : null;
      if (!autoConfigId || !own || own.subAccountId !== page.subAccountId || own.context.type !== "funnel_step") {
        out[key] =
          mode === "published"
            ? null
            : {
                connection: replaced,
                view: null,
                problem: `This Checkout belongs to “${replaced.funnelName}”, which this page isn't part of, so it won't show here. Add a Checkout step to this page's funnel, then choose it below.`,
                replaced,
              };
        continue;
      }
      configId = autoConfigId;
      config = own;
    }
    const connection = await describe(configId, config);
    if (connection.funnelStatus === "archived") {
      out[key] = mode === "published" ? null : { connection, view: null, problem: "This funnel is archived. Connect another Checkout Step.", ...(replaced ? { replaced } : {}) };
      continue;
    }
    try {
      const view = await buildCheckoutView(configId, { preview: mode === "editor" });
      out[key] = { connection: { ...connection, primaryOfferTitle: view.primary.title }, view, problem: null, ...(replaced ? { replaced } : {}) };
    } catch (err) {
      if (!(err instanceof CheckoutError)) throw err;
      out[key] = mode === "published" ? null : { connection, view: null, problem: err.message, ...(replaced ? { replaced } : {}) };
    }
  }
  return out;
}
