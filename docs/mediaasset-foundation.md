# Magnetix MediaAsset foundation

`MediaAsset` is the canonical, tenant-scoped reference for new media work.
It is additive: existing Firebase download URLs, external embeds, and
attachment shapes stay in place until each owning feature migrates.

## Persistence and access

Media assets live at:

```text
subAccounts/{subAccountId}/mediaAssets/{mediaAssetId}
```

Every record also stores `agencyId`; server services require both tenant ids
when reading or mutating an asset. Feature records should store
`mediaAssetId`, not a signed playback URL. The server verifies the feature's
access policy and returns a short-lived URL only after authorization.

`MediaAsset.storage` persists the provider, key, bucket, MIME type, and size.
It never stores a signed URL. The initial policies cover public, tenant,
owner, Community group, course, webinar, and LiveSession access, with a
verified request principal supplying membership/enrollment/registration facts.

## Provider transition

- `firebase` is an adapter for existing Firebase object keys. It can inspect,
  delete, and issue a short-lived Admin-SDK read URL; it intentionally does
  not change the existing Community upload routes.
- `s3_compatible` is a generic S3 adapter suitable for Cloudflare R2. It
  creates signed PUT and GET URLs, inspects objects, and deletes objects.
  It is inert until the server has `MAGNETIX_MEDIA_S3_ENDPOINT`,
  `MAGNETIX_MEDIA_S3_BUCKET`, `MAGNETIX_MEDIA_S3_ACCESS_KEY_ID`, and
  `MAGNETIX_MEDIA_S3_SECRET_ACCESS_KEY` (optional `MAGNETIX_MEDIA_S3_REGION`,
  `MAGNETIX_MEDIA_S3_FORCE_PATH_STYLE`). These values stay server-only.
- `external` represents a reference that Magnetix does not store or sign.

Future LiveKit Egress can create a `recording` MediaAsset as `pending` or
`processing`, write MP4/HLS objects using the S3 key, verify them, mark the
asset ready, and store `LiveSession.replayAssetId`. Poster and HLS derivative
metadata are modeled without implementing Egress. The same lifecycle supports
prerecorded video uploads and processing.

## Firebase Storage rules: current findings and safe migration

The current rules authenticate only that a Firebase user exists for several
public paths (`broadcasts`, `community`, `standalone-courses`, `course-offers`,
and `forms`). They do **not** prove the writer is entitled to the supplied
sub-account/group/course/form id, and deletes are not ownership-scoped.
Those paths are public-read by product design. Community member voice notes,
post images, and post files are different: they use member-session-authorized
server routes and Admin SDK writes because members are not Firebase-auth users;
their paths are default-denied to direct Firebase clients.

No broad rules rewrite is included because existing staff client upload flows
depend on those public paths and changing them needs a dedicated auth-claims or
server-intake migration. The safe direction is new MediaAsset intake through
server-created records plus provider-signed uploads, then feature-by-feature
migration. Existing URLs/paths must remain readable while that happens.

## Community attachment integrity correction

Post/comment normalization now accepts Firebase attachment paths only if they
match the authenticated uploader's exact generated namespace. Cleanup repeats
the same check before calling the Admin SDK. This prevents a crafted payload
from causing later post/comment cleanup to delete another member's or tenant's
object, without altering the composer or moving legacy objects.
