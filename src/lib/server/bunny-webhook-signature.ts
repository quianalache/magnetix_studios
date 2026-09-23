import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_HEADER = "x-bunnystream-signature";
const VERSION_HEADER = "x-bunnystream-signature-version";
const ALGORITHM_HEADER = "x-bunnystream-signature-algorithm";

export function verifyBunnyStreamWebhookSignature(
  rawBody: Uint8Array,
  headers: Headers,
  readOnlyApiKey: string | undefined,
): boolean {
  const signature = headers.get(SIGNATURE_HEADER)?.trim().toLowerCase() || "";
  const version = headers.get(VERSION_HEADER)?.trim().toLowerCase() || "";
  const algorithm = headers.get(ALGORITHM_HEADER)?.trim().toLowerCase() || "";
  const secret = readOnlyApiKey?.trim() || "";

  if (version !== "v1" || algorithm !== "hmac-sha256" || !secret || !/^[0-9a-f]{64}$/.test(signature)) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBytes = Buffer.from(expected, "ascii");
  const receivedBytes = Buffer.from(signature, "ascii");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}
