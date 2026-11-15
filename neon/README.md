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
- `neon/migrations/0003_write_rate_limits.sql` — server-side PostgreSQL rate limits for comments and reactions.
- `neon/migrations/0003_rate_limits.sql` — server-side rate limits enforced by PostgreSQL triggers (5 comments/10 minutes, 30 reactions/10 minutes, 5 push subscriptions/hour per anonymous visitor).
- `neon/migrations/0004_media_notifier_role.sql` — a restricted database role and SECURITY DEFINER function for GitHub Actions media-event writes.

RLS uses the Managed Auth JWT subject (`auth.user_id()`). Visitors can read public comments/reactions, create comments and reactions only for their own anonymous identity, read only their own notifications, and mark only their own notifications as read. Media-event and rate-limit tables are not exposed to the browser.

## Frontend

- `blog-app/src/neon.js` initializes Neon Auth anonymous access and wraps the Neon Data API client with polling subscriptions.
- `blog-app/src/BlogApp.js` uses the Neon client for comments, replies, reactions, and in-app notifications.
- `blog.html` loads `@neon/neon-js` through the import map.
- The old Blog-specific Supabase client was removed. Other independent apps in this repository may still use Supabase and are outside this Blog migration.

## New-photo notification workflow

The GitHub Actions workflow inserts a media event into Neon when `blog-app/src/BlogApp.js` adds a new photo to the `POSTS` list. The database trigger creates in-app notifications for previous commenters.

To enable the optional workflow, create a dedicated login role in Neon and grant it membership in `apokolips_blog_media_notifier` (the group role created by migration 0004). For example, in the Neon SQL editor run `CREATE ROLE blog_media_writer LOGIN PASSWORD '<strong-new-password>'; GRANT apokolips_blog_media_notifier TO blog_media_writer; GRANT CONNECT ON DATABASE apokolips_blog TO blog_media_writer;`. Use a newly generated password and keep it private. This login role can execute only the validated media-event function; it has no direct table-write permission. Add its direct/unpooled connection string as the GitHub Actions repository secret `NEON_DATABASE_URL`. Never use the `apokolips_owner` connection string or commit credentials. The workflow skips with a warning until the secret is configured.



## Secure GitHub Actions database access

Do **not** put the `apokolips_owner` connection string in GitHub. Before enabling the optional new-photo workflow, run the following once in the Neon SQL Editor as the database owner, replacing the password placeholder with a long random password:

```sql
create role apokolips_blog_ci login password 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
grant connect on database apokolips_blog to apokolips_blog_ci;
grant usage on schema public to apokolips_blog_ci;
grant insert on public.apokolips_blog_media_events to apokolips_blog_ci;
grant select (file_path) on public.apokolips_blog_media_events to apokolips_blog_ci;
create policy apokolips_blog_ci_media_insert
  on public.apokolips_blog_media_events
  for insert to apokolips_blog_ci
  with check (true);
```

Use the connection string for this restricted role as the GitHub Actions secret `NEON_DATABASE_URL`. It can insert media events only; PostgreSQL's security-definer trigger creates the in-page notifications. Keep the password and connection string out of Git.

## Verification checklist

- Confirm the Neon Data API is active and its CORS origins include `https://www.apokolips.xyz` and `https://apokolips.xyz`.
- Test the anonymous token flow from the live Blog page.
- Post a comment, then verify it appears for other visitors.
- Reply to a comment and verify the parent visitor receives an in-app notification.
- Change a reaction and verify only one reaction per visitor/post is retained.
- Mark a notification as read and verify it remains read after refresh.
- Add a new photo to `blog.html` and verify the GitHub workflow creates new-photo notifications.

Browser push delivery is not enabled in this cutover; the Blog's in-page notification center remains available. No Supabase project is deleted or paused.
