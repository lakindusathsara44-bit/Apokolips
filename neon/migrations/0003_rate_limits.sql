-- Server-enforced rate limits for anonymous Blog activity.
-- The table is private to the database; only this SECURITY DEFINER trigger writes it.
CREATE OR REPLACE FUNCTION public.apokolips_blog_enforce_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  action_name text;
  max_count integer;
  window_minutes integer;
  current_count integer;
BEGIN
  IF TG_TABLE_NAME = 'apokolips_blog_comments' THEN
    action_name := 'comment'; max_count := 5; window_minutes := 10;
  ELSIF TG_TABLE_NAME = 'apokolips_blog_reactions' THEN
    action_name := 'reaction'; max_count := 30; window_minutes := 10;
  ELSIF TG_TABLE_NAME = 'apokolips_blog_push_subscriptions' THEN
    action_name := 'subscription'; max_count := 5; window_minutes := 60;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.apokolips_blog_rate_limits (visitor_id, action, window_started_at, request_count)
  VALUES (NEW.visitor_id, action_name, now(), 1)
  ON CONFLICT (visitor_id, action) DO UPDATE SET
    request_count = CASE
      WHEN public.apokolips_blog_rate_limits.window_started_at < now() - make_interval(mins => window_minutes) THEN 1
      ELSE public.apokolips_blog_rate_limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.apokolips_blog_rate_limits.window_started_at < now() - make_interval(mins => window_minutes) THEN now()
      ELSE public.apokolips_blog_rate_limits.window_started_at
    END
  RETURNING request_count INTO current_count;

  IF current_count > max_count THEN
    RAISE EXCEPTION 'Rate limit exceeded for %; please wait before trying again.', action_name
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apokolips_blog_comment_rate_limit ON public.apokolips_blog_comments;
CREATE TRIGGER apokolips_blog_comment_rate_limit
BEFORE INSERT ON public.apokolips_blog_comments
FOR EACH ROW EXECUTE FUNCTION public.apokolips_blog_enforce_rate_limit();

DROP TRIGGER IF EXISTS apokolips_blog_reaction_rate_limit ON public.apokolips_blog_reactions;
CREATE TRIGGER apokolips_blog_reaction_rate_limit
BEFORE INSERT ON public.apokolips_blog_reactions
FOR EACH ROW EXECUTE FUNCTION public.apokolips_blog_enforce_rate_limit();

DROP TRIGGER IF EXISTS apokolips_blog_subscription_rate_limit ON public.apokolips_blog_push_subscriptions;
CREATE TRIGGER apokolips_blog_subscription_rate_limit
BEFORE INSERT ON public.apokolips_blog_push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.apokolips_blog_enforce_rate_limit();
