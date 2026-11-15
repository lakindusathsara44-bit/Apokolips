-- Secure Neon Data API access with Managed Better Auth anonymous JWTs.
-- Anonymous visitors can read public activity and only mutate rows tied to their JWT subject.
grant usage on schema public to anonymous, authenticated;
grant select on public.apokolips_blog_comments, public.apokolips_blog_reactions to anonymous, authenticated;
grant insert on public.apokolips_blog_comments, public.apokolips_blog_reactions to anonymous, authenticated;
grant update on public.apokolips_blog_reactions to anonymous, authenticated;
grant select, insert, update, delete on public.apokolips_blog_push_subscriptions to anonymous, authenticated;
grant select on public.apokolips_blog_notifications to anonymous, authenticated;
grant update(read_at) on public.apokolips_blog_notifications to anonymous, authenticated;
revoke all on public.apokolips_blog_media_events, public.apokolips_blog_rate_limits from anonymous, authenticated;

alter table public.apokolips_blog_comments enable row level security;
alter table public.apokolips_blog_reactions enable row level security;
alter table public.apokolips_blog_notifications enable row level security;
alter table public.apokolips_blog_push_subscriptions enable row level security;
alter table public.apokolips_blog_media_events enable row level security;
alter table public.apokolips_blog_rate_limits enable row level security;

drop policy if exists blog_comments_public_read on public.apokolips_blog_comments;
create policy blog_comments_public_read on public.apokolips_blog_comments
  for select to anonymous, authenticated using (true);
drop policy if exists blog_comments_insert_own on public.apokolips_blog_comments;
create policy blog_comments_insert_own on public.apokolips_blog_comments
  for insert to anonymous, authenticated
  with check (visitor_id = (select auth.user_id()));

drop policy if exists blog_reactions_public_read on public.apokolips_blog_reactions;
create policy blog_reactions_public_read on public.apokolips_blog_reactions
  for select to anonymous, authenticated using (true);
drop policy if exists blog_reactions_insert_own on public.apokolips_blog_reactions;
create policy blog_reactions_insert_own on public.apokolips_blog_reactions
  for insert to anonymous, authenticated
  with check (visitor_id = (select auth.user_id()));
drop policy if exists blog_reactions_update_own on public.apokolips_blog_reactions;
create policy blog_reactions_update_own on public.apokolips_blog_reactions
  for update to anonymous, authenticated
  using (visitor_id = (select auth.user_id()))
  with check (visitor_id = (select auth.user_id()));

drop policy if exists blog_notifications_read_own on public.apokolips_blog_notifications;
create policy blog_notifications_read_own on public.apokolips_blog_notifications
  for select to anonymous, authenticated
  using (recipient_visitor_id = (select auth.user_id()));
drop policy if exists blog_notifications_mark_own on public.apokolips_blog_notifications;
create policy blog_notifications_mark_own on public.apokolips_blog_notifications
  for update to anonymous, authenticated
  using (recipient_visitor_id = (select auth.user_id()))
  with check (recipient_visitor_id = (select auth.user_id()));

drop policy if exists blog_push_subscriptions_read_own on public.apokolips_blog_push_subscriptions;
create policy blog_push_subscriptions_read_own on public.apokolips_blog_push_subscriptions
  for select to anonymous, authenticated
  using (visitor_id = (select auth.user_id()));
drop policy if exists blog_push_subscriptions_insert_own on public.apokolips_blog_push_subscriptions;
create policy blog_push_subscriptions_insert_own on public.apokolips_blog_push_subscriptions
  for insert to anonymous, authenticated
  with check (visitor_id = (select auth.user_id()));
drop policy if exists blog_push_subscriptions_update_own on public.apokolips_blog_push_subscriptions;
create policy blog_push_subscriptions_update_own on public.apokolips_blog_push_subscriptions
  for update to anonymous, authenticated
  using (visitor_id = (select auth.user_id()))
  with check (visitor_id = (select auth.user_id()));
drop policy if exists blog_push_subscriptions_delete_own on public.apokolips_blog_push_subscriptions;
create policy blog_push_subscriptions_delete_own on public.apokolips_blog_push_subscriptions
  for delete to anonymous, authenticated
  using (visitor_id = (select auth.user_id()));
