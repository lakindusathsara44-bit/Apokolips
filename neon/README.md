# Apokolips Blog — Neon PostgreSQL

The Blog's social features use a new, empty Neon PostgreSQL database. No historical Supabase rows are imported.

## Neon resources

- Project: `apokolips-blog`
- Project ID: `frosty-mouse-83735944`
- Region: AWS Singapore (`aws-ap-southeast-1`)
- Branch: `production`
- Database: `apokolips_blog`
- Managed Auth: Neon Auth (Better Auth), anonymous JWTs enabled by the browser SDK
- Data API: enabled for the `public` schema
- Data API URL: `https://ep-icy-shadow-b3q76our.apirest.c-4.ap-southeast-1.aws.neon.tech/apokolips_blog/rest/v1`

## Schema

- `neon/migrations/0001_apokolips_blog.sql` — comments, replies, reactions, notifications, push subscription storage, media events, rate limits, and notification triggers.
- `neon/migrations/0002_data_api_rls.sql` — Data API grants and row-level security policies.

RLS uses the Managed Auth JWT subject (`auth.user_id()`). Visitors can read public comments/reactions, create comments and reactions only for their own anonymous identity, read only their own notifications, and mark only their own notifications as read. Media-event and rate-limit tables are not exposed to the browser.

## Frontend

- `blog-app/src/neon.js` initializes Neon Auth anonymous access and wraps the Neon Data API client with polling subscriptions.
- `blog-app/src/BlogApp.js` uses the Neon client for comments, replies, reactions, and in-app notifications.
- `blog.html` loads `@neon/neon-js` through the import map.
- The old Blog-specific Supabase client was removed. Other independent apps in this repository may still use Supabase and are outside this Blog migration.

## New-photo notification workflow

The GitHub Actions workflow inserts a media event into Neon when `blog.html` starts referencing a new photo. The database trigger creates in-app notifications for previous commenters.

After merging, add the GitHub Actions repository secret `NEON_DATABASE_URL` containing the **direct/unpooled** connection string for the `apokolips_blog` database. Do not commit the connection string. The workflow will fail safely with a clear message until this secret is configured.

## Verification checklist

- Confirm the Neon Data API is active and its CORS origins include `https://www.apokolips.xyz` and `https://apokolips.xyz`.
- Test the anonymous token flow from the live Blog page.
- Post a comment, then verify it appears for other visitors.
- Reply to a comment and verify the parent visitor receives an in-app notification.
- Change a reaction and verify only one reaction per visitor/post is retained.
- Mark a notification as read and verify it remains read after refresh.
- Add a new photo to `blog.html` and verify the GitHub workflow creates new-photo notifications.

Browser push delivery is not enabled in this cutover; the Blog's in-page notification center remains available. No Supabase project is deleted or paused.
