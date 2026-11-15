-- Restrict GitHub Actions media-event writes to a dedicated database role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apokolips_blog_media_notifier') THEN
    CREATE ROLE apokolips_blog_media_notifier NOLOGIN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apokolips_blog_register_media_event(p_file_path text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  event_id uuid;
  clean_path text;
BEGIN
  clean_path := split_part(split_part(coalesce(p_file_path, ''), '?', 1), '#', 1);
  IF length(p_file_path) < 1 OR length(p_file_path) > 500
     OR NOT (p_file_path LIKE 'https://%' OR p_file_path LIKE '/%' OR p_file_path LIKE './%')
     OR position('..' in p_file_path) > 0
     OR lower(clean_path) !~ '[.](jpe?g|png|webp|gif)$' THEN
    RAISE EXCEPTION 'Invalid Blog media path.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.apokolips_blog_media_events(file_path)
  VALUES (p_file_path)
  ON CONFLICT (file_path) DO NOTHING
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.apokolips_blog_register_media_event(text)
  FROM PUBLIC, anonymous, authenticated;
GRANT USAGE ON SCHEMA public TO apokolips_blog_media_notifier;
GRANT EXECUTE ON FUNCTION public.apokolips_blog_register_media_event(text)
  TO apokolips_blog_media_notifier;

-- For the GitHub Actions secret, create a LOGIN role in Neon and grant it
-- membership in apokolips_blog_media_notifier. Do not use apokolips_owner.
