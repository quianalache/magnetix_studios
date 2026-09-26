# Pipelines Build Log

## 2026-09-25 — final pre-release corrections

### Stage management

- Fixed `ManageStagesDialog` so choosing a reassignment destination only updates
  the local stage-management draft.
- Deal reassignment is submitted only from **Save stages**, before the staged
  archive/configuration write. **Cancel** and dialog dismissal do not call the
  reassignment endpoint, so deals cannot be moved by an abandoned edit.
- Reassignment continues through `reassignStageDeals` and
  `updateDealServerSide`; existing tenant-admin authorization, activity
  timeline entries, webhook events, workflow events, and territory bypass for
  this admin-only operation are unchanged.
- If a batched reassignment cannot empty its source stage, the save is stopped
  and the stage configuration is not archived.

### Workflow release-safety review

- The corrected server path emits `deal.updated` for every deal write and
  `deal.stage.changed` plus terminal events for stage changes. It also emits
  the existing `pipeline.stage.changed` workflow trigger.
- Only live-mode writes reach workflow enrollment. Enrollment still requires
  `automationsPaused !== true`, an `active` workflow, a matching trigger, the
  matching pipeline (default-aware for legacy workflows), optional stage/filter
  matches, and the existing re-entry/deduplication checks.
- Existing active workflows using `deal.stage.changed`,
  `pipeline.stage.changed`, `deal.won`, or `deal.lost` can run on qualifying
  post-release stage changes, including an explicitly saved bulk reassignment.
  No historical events are replayed by this release.

### Validation

- `pnpm exec tsc --noEmit` — passed.
- Targeted ESLint for the changed Pipelines file — required before commit.
- `pnpm lint` — repository baseline failure: two `@typescript-eslint/no-require-imports`
  errors in `my-ghl-app/scripts/debug-logs-query.cjs`; 54 unrelated warnings.
- Production build — required before deployment authorization.

### Release safeguards

1. Before deployment, inventory active workflows with the four stage-related
   trigger types above and confirm owners expect them to run.
2. Keep the global/sub-account workflow pause control enabled during rollout
   unless the release owner explicitly approves live trigger activation.
3. Do not run a production migration or manually test with customer records;
   validate in test mode or an isolated tenant, then observe workflow runs and
   webhook delivery logs after release.
4. If a workflow inventory or post-release observation is not available, stop
   the release rather than enabling the corrected event path blindly.

### Deployment sequence

1. Review the committed Pipelines branch and the validation results.
2. Inventory and approve affected active workflows; pause automation for the
   rollout window if required.
3. Deploy the application build only; do not run the production migration.
4. Smoke-test stage editing in an isolated/test tenant: draft reassignment →
   Cancel (no move), then draft reassignment → Save (activity/event behavior).
5. Confirm workflow-run and webhook logs, then remove the temporary pause only
   after the release owner approves.
