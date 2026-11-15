-- Apokolips Blog — fresh Neon PostgreSQL schema
-- Safe to run on a new, empty database. No Supabase data is imported.
-- Keep application access behind the Neon Function API; never expose the owner role.

CREATE TABLE IF NOT EXISTS public.apokolips_blog_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_comment_id uuid REFERENCES public.apokolips_blog_comments(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL,
  display_name varchar NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 40),
  body varchar NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  post_slug varchar NOT NULL CHECK (post_slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS apokolips_blog_comments_post_created_idx
  ON public.apokolips_blog_comments (post_slug, created_at);
CREATE INDEX IF NOT EXISTS apokolips_blog_comments_parent_idx
  ON public.apokolips_blog_comments (parent_comment_id);

CREATE TABLE IF NOT EXISTS public.apokolips_blog_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_slug varchar NOT NULL CHECK (post_slug ~ '^[a-z0-9-]+$'),
  visitor_id uuid NOT NULL,
  reaction varchar NOT NULL CHECK (reaction IN ('like', 'love', 'wow', 'fire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apokolips_blog_reactions_post_visitor_unique UNIQUE (post_slug, visitor_id)
);
CREATE INDEX IF NOT EXISTS apokolips_blog_reactions_post_idx
  ON public.apokolips_blog_reactions (post_slug);

CREATE TABLE IF NOT EXISTS public.apokolips_blog_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_visitor_id uuid NOT NULL,
  notification_type varchar NOT NULL CHECK (notification_type IN ('reply', 'new_photo')),
  title varchar NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body varchar NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  target_url text NOT NULL DEFAULT '/blog.html',
  source_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS apokolips_blog_notifications_recipient_created_idx
  ON public.apokolips_blog_notifications (recipient_visitor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.apokolips_blog_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS apokolips_blog_push_subscriptions_visitor_idx
  ON public.apokolips_blog_push_subscriptions (visitor_id);

-- Fixed-window limiter counters are keyed by anonymous device UUID and action.
CREATE TABLE IF NOT EXISTS public.apokolips_blog_rate_limits (
  visitor_id uuid NOT NULL,
  action varchar NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (visitor_id, action)
);

-- Tracks newly published media so existing commenters can receive in-app notices.
CREATE TABLE IF NOT EXISTS public.apokolips_blog_media_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.apokolips_blog_create_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient_id uuid;
BEGIN
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT visitor_id INTO recipient_id
  FROM public.apokolips_blog_comments
  WHERE id = NEW.parent_comment_id AND post_slug = NEW.post_slug;

  IF recipient_id IS NOT NULL AND recipient_id <> NEW.visitor_id THEN
    INSERT INTO public.apokolips_blog_notifications
      (recipient_visitor_id, notification_type, title, body, target_url, source_id)
    VALUES
      (recipient_id, 'reply', 'New reply to your comment',
       left(NEW.display_name || ': ' || NEW.body, 300),
       '/blog.html#comment-' || NEW.parent_comment_id::text, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_notify_commenters_of_new_photo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recipient record;
BEGIN
  FOR recipient IN
    SELECT DISTINCT visitor_id FROM public.apokolips_blog_comments
  LOOP
    INSERT INTO public.apokolips_blog_notifications
      (recipient_visitor_id, notification_type, title, body, target_url, source_id)
    VALUES
      (recipient.visitor_id, 'new_photo',
       'A new photo was added to Apokolips Blog',
       'There is a new photo in the travel memories. Open the blog to see it.',
       '/blog.html#memories', NEW.id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apokolips_blog_reply_notification ON public.apokolips_blog_comments;
CREATE TRIGGER apokolips_blog_reply_notification
AFTER INSERT ON public.apokolips_blog_comments
FOR EACH ROW EXECUTE FUNCTION public.apokolips_blog_create_reply_notification();

DROP TRIGGER IF EXISTS apokolips_blog_new_photo_notification ON public.apokolips_blog_media_events;
CREATE TRIGGER apokolips_blog_new_photo_notification
AFTER INSERT ON public.apokolips_blog_media_events
FOR EACH ROW EXECUTE FUNCTION public.apokolips_blog_notify_commenters_of_new_photo();
