import "server-only";

import { VercelError, requireConfig, vercelFetch } from "@/lib/vercel/client";
import type { CustomDomainVerificationRecord } from "@/types/tenancy";

/**
 * Vercel Domains API — the custom-domain counterpart to client.ts's env-var
 * functions. Same credentials (`VERCEL_TOKEN`/`VERCEL_PROJECT_ID`/
 * `VERCEL_TEAM_ID`), already provisioned for the setup form — nothing new to
 * configure. Used by `src/lib/domains/custom-domain-service.ts`, which is
 * the Firestore-aware layer callers should actually go through.
 */

interface VercelDomainResponse {
  name: string;
  apexName?: string;
  projectId?: string;
  verified: boolean;
  verification?: CustomDomainVerificationRecord[];
}

export interface DomainStatus {
  verified: boolean;
  /** Records still needed for verification. Empty once verified. */
  verification: CustomDomainVerificationRecord[];
  /** True when Vercel can see DNS pointed elsewhere / misconfigured, distinct from "not yet verified". */
  misconfigured: boolean;
}

/** Register a domain against this Vercel project. Idempotent — re-adding an already-attached domain just returns its current state. */
export async function addDomainToProject(domain: string): Promise<VercelDomainResponse> {
  const { projectId, teamId } = requireConfig();
  return (await vercelFetch(
    `/v10/projects/${projectId}/domains`,
    { method: "POST", body: JSON.stringify({ name: domain }) },
    teamId,
  )) as VercelDomainResponse;
}

/** Ask Vercel to re-check DNS + mark the domain verified if it now resolves correctly. */
export async function verifyProjectDomain(domain: string): Promise<VercelDomainResponse> {
  const { projectId, teamId } = requireConfig();
  return (await vercelFetch(
    `/v9/projects/${projectId}/domains/${domain}/verify`,
    { method: "POST" },
    teamId,
  )) as VercelDomainResponse;
}

/**
 * Current verification + DNS-config status. Two calls because Vercel splits
 * "is this domain verified for the project" (ownership challenge) from "is
 * DNS actually pointed at us correctly" (config/misconfigured) — a domain
 * can be verified but still misconfigured if the A/CNAME hasn't propagated
 * yet, which is exactly the pending state the settings UI needs to show.
 */
export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const { projectId, teamId } = requireConfig();
  const [domainRes, configRes] = await Promise.all([
    vercelFetch(`/v9/projects/${projectId}/domains/${domain}`, { method: "GET" }, teamId).catch(
      (e) => {
        if (e instanceof VercelError && e.status === 404) {
          return { name: domain, verified: false, verification: [] } as VercelDomainResponse;
        }
        throw e;
      },
    ),
    vercelFetch(`/v6/domains/${domain}/config`, { method: "GET" }, teamId).catch(
      () => ({ misconfigured: false }) as { misconfigured: boolean },
    ),
  ]);
  const d = domainRes as VercelDomainResponse;
  const c = configRes as { misconfigured?: boolean };
  return {
    verified: !!d.verified,
    verification: d.verification ?? [],
    misconfigured: !!c.misconfigured,
  };
}

/** Detach the domain from this Vercel project (does not release the registration itself, just this project's use of it). */
export async function removeDomainFromProject(domain: string): Promise<void> {
  const { projectId, teamId } = requireConfig();
  await vercelFetch(`/v9/projects/${projectId}/domains/${domain}`, { method: "DELETE" }, teamId);
}
