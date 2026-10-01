import assert from "node:assert/strict";
import type { EnergeticDecoderRequest } from "../src/types/energetic-decoder";
import { sanitizePublicDecoderInput } from "../src/lib/energetics/public-input";

const body: EnergeticDecoderRequest = {
  name: "Public visitor",
  email: "visitor@example.test",
  birthDate: "1990-01-01",
  birthTime: "12:00",
  birthPlace: "Austin, TX",
  profileId: "existing-profile",
  contactId: "existing-contact",
};
const sanitized = sanitizePublicDecoderInput(body);
assert.equal(sanitized.profileId, undefined, "public input cannot select an existing profile");
assert.equal(sanitized.contactId, undefined, "public input cannot select an existing contact");
assert.equal(sanitized.email, body.email, "public lead fields remain available");
assert.equal(sanitized.birthPlace, body.birthPlace, "public birth data remains available");

console.log("Energetic Decoder Batch 1 focused security checks passed.");
