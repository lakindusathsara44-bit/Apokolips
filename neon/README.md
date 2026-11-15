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

The deployed Function has the VAPID key pair and `APOKOLIPS_BLOG_WEBHOOK_SECRET` configured as private Function environment variables. Never commit these values.

## GitHub Actions secret

Set the repository Actions secret `APOKOLIPS_BLOG_PUSH_FUNCTION_URL` to the Function URL above. Set `APOKOLIPS_BLOG_WEBHOOK_SECRET` to the shared webhook secret supplied separately to the project owner. The workflow appends `/media-event` and posts newly referenced images to Neon.

## Deployment and verification

Deploy the Function from `neon/functions/blogapi` using the Neon Functions deployment workflow. Verify:

- `GET /health` returns `{ "ok": true }`.
- `GET /comments?post_slug=travel-memory-2026-10-16` returns an empty `data` array on a fresh database.
- A comment can be created and then appears in the comments list.
- A reply creates a notification for the parent comment's visitor.
- Reaction updates are unique per visitor and post.
- Push subscriptions are saved and push notifications are sent when a reply/new-photo notification is created.
