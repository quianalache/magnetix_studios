import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  const value = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!value) throw new Error("AUTOMATIONS_TOKEN_SECRET is not configured.");
  return value;
}

export function signWebinarRegistrantToken(
  subAccountId: string,
  webinarId: string,
  registrantId: string
) {
  const payload = `${subAccountId}.${webinarId}.${registrantId}`;
  const sig = createHmac("sha256", secret())
    .update(`webinar:${payload}`)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifyWebinarRegistrantToken(token: string) {
  const [subAccountId, webinarId, registrantId, provided] = token.split(".");
  if (!subAccountId || !webinarId || !registrantId || !provided) return null;
  const expected = createHmac("sha256", secret())
    .update(`webinar:${subAccountId}.${webinarId}.${registrantId}`)
    .digest("hex");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected)))
    return null;
  return { subAccountId, webinarId, registrantId };
}
