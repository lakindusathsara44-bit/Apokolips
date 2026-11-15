# Apokolips Blog — Neon database

The Apokolips Blog is being moved to the Neon project `apokolips-blog` (PostgreSQL 17, Singapore).

## Fresh-start policy

- No historical Supabase rows are imported.
- The existing Supabase project is not paused, deleted, or modified by this change.
- The frontend must not contain a Neon owner connection string or password.
- Public browser traffic must go through a restricted API (prefer a Neon Function). Do not expose the database owner role or enable broad anonymous table grants.

## Schema

Run `001_apokolips_blog_schema.sql` against the `apokolips_blog` database on the `production` branch. It creates the tables and indexes for comments/replies, reactions, in-app notifications, push subscriptions, rate-limit counters, and media publication events. Reply and new-photo notification triggers are included.

The schema intentionally has no RLS policies yet because the intended access path is a trusted server API, not direct browser access to Postgres. Do not expose the tables through a public Data API until the authentication and role model has been reviewed.

## Required application API contract

The current React page still calls Supabase-style methods. Before switching production traffic, replace those calls with a Neon-backed API that supports:

- reading reactions and comments by post slug;
- writing a reaction with a unique `(post_slug, visitor_id)` key;
- writing a comment/reply with parent-comment validation and server-side rate limiting;
- reading and marking a visitor's notifications;
- saving a browser push subscription;
- returning aggregate comment/reaction counts.

The API must validate UUIDs, post slugs, reaction names, and input lengths; enforce origin allow-lists and rate limits; and keep the Neon connection string server-side. In-app notification polling can be used initially; Neon Realtime can be added once the sealed-query authorization path is deployed. Web Push additionally needs VAPID public/private keys and a delivery worker; storing subscriptions alone does not send push messages.

## Verification checklist

- [ ] Apply schema to the intended Neon branch.
- [ ] Confirm table definitions, indexes, foreign keys, and notification triggers.
- [ ] Confirm all new tables start empty.
- [ ] Deploy and test the restricted Neon API.
- [ ] Test comments, replies, reactions, notification ownership, rate limits, and cross-origin behavior.
- [ ] Test the production build and browser flows.
- [ ] Switch the frontend only after the API is live and verified.
