# Magnetix Studios — Pipelines Release Manifest

**Release target:** `pipelines-multi`

**Application commit:** `82b69fd` (`Fix pipeline stage management save semantics`)

**Preparation date:** 2026-09-25
**Status:** Release candidate; not pushed, deployed, paused, migrated, or run against production.

## Included scope

- Multiple pipelines, pipeline-specific stages, board/list views, deal details,
  stage management, notes/activity, related tasks/appointments, workflows,
  public deal APIs, import compatibility, reporting, labels, and card settings
  from Pipelines M1–M5.
- Final correction: stage reassignment is draft-only until **Save stages**;
  Cancel/dismissal makes no deal changes.
- Existing deal activity, webhook, workflow, permission, and tenant guards are
  preserved through `updateDealServerSide` and the admin-only route.

## Workflow impact inventory

The supported stage-related trigger types are:

| Trigger | Can run after release? | Conditions |
| --- | --- | --- |
| `deal.stage.changed` | Yes | Live deal stage change; active matching workflow |
| `pipeline.stage.changed` | Yes | Live stage change; pipeline/stage/filter/re-entry checks |
| `deal.won` | Yes | Live transition into Won |
| `deal.lost` | Yes | Live transition into Lost |

The event path does not replay historical changes. A saved bulk reassignment
does produce one normal server-side stage change per deal, so it can enroll
matching active workflows. `automationsPaused === true`, non-live mode,
non-active workflows, pipeline mismatch, stage mismatch, filters, and existing
re-entry/deduplication controls remain effective.

### Production inventory status

No production Firestore/workflow inventory was available in the repository or
through an authorized read-only production connector during this preparation.
The release owner must approve a read-only query/export of active workflows
before deployment. Do not infer production workflow presence from test fixtures.

Required query shape:

```text
workflows where status == "active"
  and trigger.type in {
    "deal.stage.changed",
    "pipeline.stage.changed",
    "deal.won",
    "deal.lost"
  }
```

Record each workflow ID, sub-account, trigger pipeline/stage filters, re-entry
mode, and downstream side effects. Do not modify the returned workflows.

## Firestore requirements

### Rules

No new rules are required. The Pipelines and workflow endpoints use the Admin
SDK, and the route layer applies the existing tenant/member/admin checks.
The branch has no `firestore.rules` delta from `origin/main`.

### Indexes

One new composite index is required before enabling stage archival/reassignment
in production:

```text
collectionGroup: deals
queryScope: COLLECTION
subAccountId: ASCENDING
stageId: ASCENDING
```

It is prepared in `firestore.indexes.json`. Existing `deals` indexes remain in
place for territory and contact queries. The application otherwise narrows
pipeline membership in memory, preserving legacy documents without a
`pipelineId`.

## Migration decision

The existing-data migration is **not required for launch**. The application
intentionally supports legacy data: a missing `pipelineId` resolves to the
default pipeline, and an unmigrated sub-account gets a virtual default
pipeline.

The migration remains recommended as a separately authorized operational task
after launch. It materializes `subAccounts/{id}/pipelines/default`, stamps only
missing deal `pipelineId` fields, writes an auditable manifest, and supports
reconciliation and guarded rollback. It must not run as part of application
deployment.

## Required order of operations

1. Approve this manifest and the production workflow inventory.
2. Deploy the prepared Firestore composite index and wait for it to become
   ready.
3. Deploy the application commit `82b69fd` plus the manifest/index change.
4. Run isolated/test-tenant QA only: stage draft → Cancel; stage draft → Save;
   verify activity/event behavior and permissions.
5. Observe workflow runs and webhook delivery logs before normalizing traffic.
6. Separately schedule the migration only if the release owner approves it;
   run dry-run, review anomalies, apply, reconcile, and retain the manifest.

## Rollback

- **Before app deploy:** remove the release candidate and leave the index in
  place; an unused composite index is harmless.
- **After app deploy, before migration:** roll back application code to the
  prior release. Do not delete the index. Existing stage data is unchanged by
  the code rollback.
- **After a saved reassignment:** application rollback cannot automatically
  reverse customer-approved deal moves; use the activity/event audit trail and
  an explicitly reviewed compensating move.
- **After migration:** use only the migration manifest's guarded rollback;
  it skips records edited since migration and never force-overwrites them.
- Do not roll back by deleting pipeline documents or bulk-editing deals.

## Production QA checklist

- [ ] Branch is clean and application commit is `82b69fd`.
- [ ] TypeScript passes; production build has passed.
- [ ] Full-lint baseline errors are documented and unrelated to Pipelines.
- [ ] `deals(subAccountId, stageId)` index is deployed and ready.
- [ ] No Pipelines Firestore rules change is required.
- [ ] Active production workflows using all four trigger types are inventoried
      and owners approve their expected behavior.
- [ ] No workflow was modified or paused as part of preparation.
- [ ] Admin can stage a move and Cancel without changing a deal.
- [ ] Admin can Save a reassignment and sees preserved activity history.
- [ ] Non-admin/cross-tenant access remains denied.
- [ ] Won/Lost transitions and matching workflow/webhook logs are observed in
      an isolated/test tenant.
- [ ] No production migration has run.
- [ ] Rollback owner, release window, and monitoring owner are assigned.

## Decisions requiring release-owner approval

1. Approve the read-only production workflow inventory and review of its
   downstream side effects.
2. Approve deployment of the new composite Firestore index before application
   rollout.
3. Confirm that launch proceeds without the existing-data migration, with a
   separate migration decision later.
4. Name the authoritative Magnetix Build Log location. No existing
   Magnetix Build Log file was present in this checkout or the shared
   Documents workspace, so the Pipelines Build Log could not be merged into a
   pre-existing artifact without inventing its location.
