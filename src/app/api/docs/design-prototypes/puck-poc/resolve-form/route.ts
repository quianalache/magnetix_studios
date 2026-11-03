/**
 * Phase-1 Puck POC harness resolver. It used to read ANY Form by id for any
 * signed-in user. It now delegates to the production, tenant-checked
 * resolver (`pageId` + `formId`, caller must be able to open the page's
 * workspace); the POC harness has no page, so it resolves nothing — its
 * Form element shows its not-found state, which is fine for a prototype.
 */
export { GET } from "@/app/api/pages-funnels/puck/resolve-form/route";
