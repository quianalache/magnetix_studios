import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { bunnyWebhookFingerprint, verifyBunnyStreamWebhookSignature } from "./bunny-webhook-signature";

const key = "read-only-test-key";
const body = Buffer.from('{"VideoGuid":"abc","Status":4}');
const signature = createHmac("sha256", key).update(body).digest("hex");

function headers(value = signature, overrides: Record<string, string> = {}) {
  return new Headers({
    "X-BunnyStream-Signature-Version": "v1",
    "X-BunnyStream-Signature-Algorithm": "hmac-sha256",
    "X-BunnyStream-Signature": value,
    ...overrides,
  });
}

test("accepts a signature over exact raw body bytes", () => {
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers(), key), true);
});

test("rejects wrong, missing, and tampered signatures", () => {
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers("0".repeat(64)), key), false);
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers(""), key), false);
  assert.equal(verifyBunnyStreamWebhookSignature(Buffer.from('{"VideoGuid":"abc","Status":5}'), headers(), key), false);
});

test("rejects unsupported signature metadata and missing secret", () => {
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers(signature, { "X-BunnyStream-Signature-Version": "v0" }), key), false);
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers(signature, { "X-BunnyStream-Signature-Algorithm": "sha256" }), key), false);
  assert.equal(verifyBunnyStreamWebhookSignature(body, headers(), undefined), false);
});

test("fingerprints exact raw bytes and separates lifecycle payloads", () => {
  assert.equal(bunnyWebhookFingerprint(body), bunnyWebhookFingerprint(Buffer.from(body)));
  assert.notEqual(bunnyWebhookFingerprint(body), bunnyWebhookFingerprint(Buffer.from('{"VideoGuid":"abc","Status":3}')));
});
