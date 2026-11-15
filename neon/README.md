# Apokolips Blog — Neon backend

The Blog social layer now uses Neon PostgreSQL through the `blogapi` Neon Function. The frontend does not contain a database password or privileged connection string.

## Resources

- Neon project: `apokolips-blog`
- Database: `apokolips_blog`
- Branch: `production`
- Function slug: `blogapi`
- Function URL: https://br-silent-frost-b3chnc64-blogapi.compute.c-4.ap-southeast-1.aws.neon.tech/
- Schema migration: `neon/migrations/0001_apokolips_blog.sql`
- Function source: `neon/functions/blogapi/index.mjs`

## Fresh database

This migration creates an empty Blog activity database. It intentionally imports no historical Supabase rows. It creates comments, replies, reactions, notifications, web-push subscriptions, media events, and rate-limit tables. Reply and new-photo notification rows are created by PostgreSQL triggers.

## Frontend API

The client uses `blog-app/src/neon.js`. Live activity is refreshed by lightweight polling because the React app no longer uses Supabase Realtime. The API validates payloads, limits comment/reaction/subscription rates per visitor, and only accepts the Apokolips website origins.

## Function environment

The Neon Function is deployed (Node.js 24). Neon injects `DATABASE_URL` for the branch. **Web Push delivery is not yet configured**: add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` as private Function environment variables before enabling browser push. The media webhook also needs `APOKOLIPS_BLOG_WEBHOOK_SECRET`. Never commit these values.

## GitHub Actions secret

To enable new-photo webhook delivery, set the repository Actions secrets `APOKOLIPS_BLOG_PUSH_FUNCTION_URL` to the Function URL above and `APOKOLIPS_BLOG_WEBHOOK_SECRET` to the same secret configured on the Neon Function. Until both are present, the workflow skips safely. The workflow appends `/media-event` and posts newly referenced images to Neon.

## Deployment and verification

Deploy the Function from `neon/functions/blogapi` using the Neon Functions deployment workflow. Verify:

- `GET /health` returns `{ "ok": true }`.
- `GET /comments?post_slug=travel-memory-2026-10-16` returns an empty `data` array on a fresh database.
- A comment can be created and then appears in the comments list.
- A reply creates a notification for the parent comment's visitor.
- Reaction updates are unique per visitor and post.
- Push subscriptions are saved. Actual browser push delivery is verified only after VAPID keys and the webhook secret are configured.
