import "server-only";

import { emailDocumentFromBroadcast } from "@/lib/email/adapters";
import { renderEmailHtml, renderEmailText } from "@/lib/email/render";
import type { BroadcastContent } from "@/types/broadcast-content";
import type { EmailDocument } from "@/types/email-document";

interface RenderOpts {
  unsubscribeUrl: string;
  mailingAddress: string;
  businessName: string;
}

interface RenderOptions {
  resolveMergeTags?: (value: string) => string;
}

function sharedRenderOptions(opts: RenderOpts, options: RenderOptions) {
  return {
    businessName: opts.businessName,
    mailingAddress: opts.mailingAddress,
    unsubscribeUrl: opts.unsubscribeUrl,
    includeComplianceFooter: true,
    resolveMergeTags: options.resolveMergeTags,
  };
}

export function renderBroadcastEmailDocumentHtml(
  document: EmailDocument,
  opts: RenderOpts,
  options: RenderOptions = {},
): string {
  return renderEmailHtml(document, sharedRenderOptions(opts, options));
}

export function renderBroadcastEmailDocumentText(
  document: EmailDocument,
  opts: RenderOpts,
  options: RenderOptions = {},
): string {
  return renderEmailText(document, sharedRenderOptions(opts, options));
}

/** Compatibility boundary for Broadcast's persisted block schema. */
export function renderBroadcastEmailHtml(
  content: BroadcastContent,
  opts: RenderOpts,
  subject = "Broadcast",
  preheader: string | null = null,
  renderOptions: RenderOptions = {}
): string {
  return renderBroadcastEmailDocumentHtml(
    emailDocumentFromBroadcast(content, subject, preheader),
    opts,
    renderOptions,
  );
}

export function renderBroadcastEmailText(
  content: BroadcastContent,
  opts: RenderOpts,
  subject = "Broadcast",
  preheader: string | null = null,
  renderOptions: RenderOptions = {}
): string {
  return renderBroadcastEmailDocumentText(
    emailDocumentFromBroadcast(content, subject, preheader),
    opts,
    renderOptions,
  );
}
