-- Blog anonymous visitor identity and least-privilege Data API access.
-- Each browser keeps a random UUID in localStorage. The UUID is passed only to
-- narrowly scoped SECURITY DEFINER RPCs; visitor_id is no longer readable
-- through the public Data API, so other visitors cannot enumerate identifiers.
-- Existing rows with visitor_id='anonymous' are intentionally preserved.

CREATE OR REPLACE FUNCTION public.apokolips_blog_get_my_reaction(
  p_post_slug text,
  p_visitor_id text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  current_reaction text;
BEGIN
  IF coalesce(p_post_slug, '') !~ '^[a-z0-9][a-z0-9-]{0,119}$'
     OR coalesce(p_visitor_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;

  SELECT r.reaction
    INTO current_reaction
    FROM public.apokolips_blog_reactions AS r
   WHERE r.post_slug = p_post_slug
     AND r.visitor_id = p_visitor_id
   LIMIT 1;

  RETURN current_reaction;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_set_reaction(
  p_post_slug text,
  p_visitor_id text,
  p_reaction text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(p_post_slug, '') !~ '^[a-z0-9][a-z0-9-]{0,119}$' THEN
    RAISE EXCEPTION 'Invalid Blog post.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_visitor_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid visitor identifier.' USING ERRCODE = '22023';
  END IF;

  IF p_reaction NOT IN ('like', 'love', 'wow', 'fire') THEN
    RAISE EXCEPTION 'Invalid reaction.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.apokolips_blog_reactions (post_slug, visitor_id, reaction)
  VALUES (p_post_slug, p_visitor_id, p_reaction)
  ON CONFLICT (post_slug, visitor_id)
  DO UPDATE SET
    reaction = EXCLUDED.reaction,
    updated_at = now();

  RETURN p_reaction;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_add_comment(
  p_post_slug text,
  p_visitor_id text,
  p_display_name text,
  p_body text,
  p_parent_comment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  new_comment_id uuid;
  clean_name text;
  clean_body text;
BEGIN
  IF coalesce(p_post_slug, '') !~ '^[a-z0-9][a-z0-9-]{0,119}$' THEN
    RAISE EXCEPTION 'Invalid Blog post.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_visitor_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid visitor identifier.' USING ERRCODE = '22023';
  END IF;

  clean_name := left(btrim(coalesce(p_display_name, '')), 40);
  clean_body := left(btrim(coalesce(p_body, '')), 500);

  IF clean_name = '' THEN
    RAISE EXCEPTION 'Please enter your display name.' USING ERRCODE = '22023';
  END IF;

  IF clean_body = '' THEN
    RAISE EXCEPTION 'Please write a comment.' USING ERRCODE = '22023';
  END IF;

  IF p_parent_comment_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM public.apokolips_blog_comments AS parent
        WHERE parent.id = p_parent_comment_id
          AND parent.post_slug = p_post_slug
     ) THEN
    RAISE EXCEPTION 'The comment you are replying to could not be found.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.apokolips_blog_comments (
    post_slug, visitor_id, display_name, body, parent_comment_id
  )
  VALUES (
    p_post_slug, p_visitor_id, clean_name, clean_body, p_parent_comment_id
  )
  RETURNING id INTO new_comment_id;

  RETURN new_comment_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_get_notifications(
  p_visitor_id text
)
RETURNS TABLE (
  id uuid,
  title character varying,
  body character varying,
  target_url text,
  created_at timestamp with time zone,
  read_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF coalesce(p_visitor_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT n.id, n.title, n.body, n.target_url, n.created_at, n.read_at
    FROM public.apokolips_blog_notifications AS n
   WHERE n.recipient_visitor_id = p_visitor_id
   ORDER BY n.created_at DESC
   LIMIT 30;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_mark_notification_read(
  p_visitor_id text,
  p_notification_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  updated_rows integer;
BEGIN
  IF coalesce(p_visitor_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_notification_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.apokolips_blog_notifications AS n
     SET read_at = coalesce(n.read_at, now())
   WHERE n.id = p_notification_id
     AND n.recipient_visitor_id = p_visitor_id;

  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END;
$function$;

-- Do not expose browser identity values or allow direct writes through the
-- anonymous Data API. Public comment/reaction reads remain available on the
-- fields the site actually displays. Writes are routed through the RPCs above.

REVOKE ALL PRIVILEGES ON TABLE public.apokolips_blog_comments FROM anonymous;
REVOKE ALL PRIVILEGES
  (id, parent_comment_id, visitor_id, display_name, body, created_at, post_slug)
  ON TABLE public.apokolips_blog_comments FROM anonymous;
GRANT SELECT (id, parent_comment_id, display_name, body, created_at, post_slug)
  ON TABLE public.apokolips_blog_comments TO anonymous;

REVOKE ALL PRIVILEGES ON TABLE public.apokolips_blog_reactions FROM anonymous;
REVOKE ALL PRIVILEGES
  (id, post_slug, visitor_id, reaction, created_at, updated_at)
  ON TABLE public.apokolips_blog_reactions FROM anonymous;
GRANT SELECT (id, post_slug, reaction, created_at, updated_at)
  ON TABLE public.apokolips_blog_reactions TO anonymous;

REVOKE ALL PRIVILEGES ON TABLE public.apokolips_blog_notifications FROM anonymous;
REVOKE ALL PRIVILEGES
  (id, recipient_visitor_id, notification_type, title, body, target_url, source_id, created_at, read_at)
  ON TABLE public.apokolips_blog_notifications FROM anonymous;

REVOKE ALL PRIVILEGES ON FUNCTION public.apokolips_blog_get_my_reaction(text, text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.apokolips_blog_set_reaction(text, text, text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.apokolips_blog_add_comment(text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.apokolips_blog_get_notifications(text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.apokolips_blog_mark_notification_read(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apokolips_blog_get_my_reaction(text, text) TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.apokolips_blog_set_reaction(text, text, text) TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.apokolips_blog_add_comment(text, text, text, text, uuid) TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.apokolips_blog_get_notifications(text) TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION public.apokolips_blog_mark_notification_read(text, uuid) TO anonymous, authenticated;
