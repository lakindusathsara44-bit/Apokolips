-- Apokolips Blog: initial Neon schema.
-- This starts with an empty dataset; no Supabase rows are imported.
create extension if not exists pgcrypto;

create table if not exists public.apokolips_blog_comments (
  id uuid primary key default gen_random_uuid(),
  parent_comment_id uuid references public.apokolips_blog_comments(id) on delete cascade,
  visitor_id uuid not null,
  display_name varchar(40) not null check (char_length(trim(display_name)) between 1 and 40),
  body varchar(500) not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  post_slug varchar(160) not null check (post_slug ~ '^[a-z0-9-]+$')
);
create index if not exists apokolips_blog_comments_post_created_idx on public.apokolips_blog_comments(post_slug, created_at asc);
create index if not exists apokolips_blog_comments_parent_idx on public.apokolips_blog_comments(parent_comment_id);

create table if not exists public.apokolips_blog_reactions (
  id uuid primary key default gen_random_uuid(),
  post_slug varchar(160) not null check (post_slug ~ '^[a-z0-9-]+$'),
  visitor_id uuid not null,
  reaction varchar(10) not null check (reaction in ('like','love','wow','fire')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apokolips_blog_reactions_post_visitor_unique unique(post_slug, visitor_id)
);
create index if not exists apokolips_blog_reactions_post_idx on public.apokolips_blog_reactions(post_slug);

create table if not exists public.apokolips_blog_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_visitor_id uuid not null,
  notification_type varchar(20) not null check (notification_type in ('reply','new_photo')),
  title varchar(120) not null check (char_length(title) between 1 and 120),
  body varchar(300) not null check (char_length(body) between 1 and 300),
  target_url text not null default '/blog.html',
  source_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists apokolips_blog_notifications_recipient_created_idx on public.apokolips_blog_notifications(recipient_visitor_id, created_at desc);

create table if not exists public.apokolips_blog_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists apokolips_blog_push_subscriptions_visitor_idx on public.apokolips_blog_push_subscriptions(visitor_id);

create table if not exists public.apokolips_blog_media_events (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.apokolips_blog_rate_limits (
  visitor_id uuid not null,
  action varchar(20) not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1,
  primary key(visitor_id, action)
);

create or replace function public.apokolips_blog_create_reply_notification()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient_id uuid;
begin
  if new.parent_comment_id is null then return new; end if;
  select visitor_id into recipient_id from public.apokolips_blog_comments
  where id = new.parent_comment_id and post_slug = new.post_slug;
  if recipient_id is not null and recipient_id <> new.visitor_id then
    insert into public.apokolips_blog_notifications
      (recipient_visitor_id, notification_type, title, body, target_url, source_id)
    values (recipient_id, 'reply', 'New reply to your comment',
      left(new.display_name || ': ' || new.body, 300),
      '/blog.html#comment-' || new.parent_comment_id::text, new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists apokolips_blog_reply_notification on public.apokolips_blog_comments;
create trigger apokolips_blog_reply_notification after insert on public.apokolips_blog_comments
for each row execute function public.apokolips_blog_create_reply_notification();

create or replace function public.apokolips_blog_notify_commenters_of_new_photo()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare recipient record;
begin
  for recipient in select distinct visitor_id from public.apokolips_blog_comments loop
    insert into public.apokolips_blog_notifications
      (recipient_visitor_id, notification_type, title, body, target_url, source_id)
    values (recipient.visitor_id, 'new_photo', 'A new photo was added to Apokolips Blog',
      'There is a new photo in the travel memories. Open the blog to see it.',
      '/blog.html#memories', new.id);
  end loop;
  return new;
end;
$$;
drop trigger if exists apokolips_blog_new_photo_notification on public.apokolips_blog_media_events;
create trigger apokolips_blog_new_photo_notification after insert on public.apokolips_blog_media_events
for each row execute function public.apokolips_blog_notify_commenters_of_new_photo();
