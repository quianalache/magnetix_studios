/**
 * Community member activation email — guarded send tool.
 *
 * PREVIEW (default, read-only):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" node --env-file=.env.local \
 *     --import tsx scripts/community-activation-email.ts --preset mvc
 *
 * TEST SEND (one member, no duplicate ledger; the email goes to THAT member's own address):
 *   ... --preset mvc --test-email someone@example.com
 *
 * PRODUCTION SEND (only after the owner approves the preview; --confirm must equal
 * the previewed "needs activation" count, so a changed audience refuses to send):
 *   ... --preset mvc --send --confirm 67
 *
 * Links always use the canonical CRM origin. Raw tokens are never printed.
 */
import { CANONICAL_APP_ORIGIN } from "../src/lib/server/app-origin";
import {
  communityActivationSubject,
  previewCommunityActivation,
  sendCommunityActivationEmail,
  type ActivationCampaign,
} from "../src/lib/server/community-activation-service";

const PRESETS: Record<string, ActivationCampaign> = {
  // Magnetic Visibility Circle — Quiana LaChé workspace. The owner's own two
  // addresses are excluded from the production send (test them with --test-email).
  mvc: {
    subAccountId: "xvnedVCmQpEvHrcPhEDI",
    groupId: "TBp39lWSZJCtLguowmqB",
    campaign: "mvc-activation-2026-11",
    communityName: "Magnetic Visibility Circle",
    excludeEmails: ["quiana@quianalache.com", "quianalache@gmail.com"],
  },
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const has = (name: string) => process.argv.includes(`--${name}`);
const mask = (email: string) => email.replace(/^(.{2})[^@]*@/, "$1***@");

async function main() {
  const preset = PRESETS[arg("preset") ?? ""];
  const campaign: ActivationCampaign | null = preset
    ? preset
    : arg("sa") && arg("group") && arg("campaign")
      ? { subAccountId: arg("sa")!, groupId: arg("group")!, campaign: arg("campaign")!, communityName: arg("name") ?? "the community", excludeEmails: (arg("exclude") ?? "").split(",").filter(Boolean) }
      : null;
  if (!campaign) throw new Error("Pass --preset mvc, or --sa --group --campaign [--name] [--exclude a,b].");
  const origin = arg("origin") ?? CANONICAL_APP_ORIGIN;
  const c = { ...campaign, origin };

  const preview = await previewCommunityActivation(campaign);
  console.log(`Community: ${preview.groupName} (/${preview.groupSlug}) · campaign ${campaign.campaign}`);
  console.log(`Subject: ${communityActivationSubject(campaign.communityName)}`);
  console.log("Counts:", JSON.stringify(preview.counts));
  for (const r of preview.recipients.filter((r) => r.state !== "needs_activation")) {
    console.log(`  skip ${r.state.padEnd(18)} ${mask(r.email)}  ${r.reason ?? ""}`);
  }

  const testEmail = arg("test-email")?.trim().toLowerCase();
  if (testEmail) {
    const target = preview.recipients.find((r) => r.email === testEmail);
    if (!target) throw new Error("That email isn't an active member of this community.");
    const result = await sendCommunityActivationEmail(c, target.memberId, { test: true });
    console.log("TEST SEND:", result.ok ? `sent to ${mask(target.email)} (message ${result.messageId})` : `${result.skipped}: ${result.reason}`);
    return;
  }

  if (!has("send")) {
    console.log(`\nPreview only. ${preview.counts.needs_activation} member(s) would receive the email.`);
    return;
  }
  const confirm = Number(arg("confirm"));
  if (confirm !== preview.counts.needs_activation) {
    throw new Error(`Refusing to send: --confirm ${arg("confirm")} doesn't match the ${preview.counts.needs_activation} members who need activation.`);
  }
  const targets = preview.recipients.filter((r) => r.state === "needs_activation");
  let sent = 0;
  const problems: string[] = [];
  for (const r of targets) {
    const result = await sendCommunityActivationEmail(c, r.memberId);
    if (result.ok) sent++;
    else problems.push(`${mask(r.email)}: ${result.skipped} — ${result.reason}`);
    await new Promise((resolve) => setTimeout(resolve, 600)); // stay well under Resend's rate limit
  }
  console.log(`\nSENT ${sent}/${targets.length}.`);
  for (const p of problems) console.log("  not sent:", p);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
