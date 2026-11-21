-- Add a public, small uploader attribution to each Blog post.
ALTER TABLE public.bloguploader_posts
  ADD COLUMN IF NOT EXISTS uploader_name text NOT NULL DEFAULT 'Apokolips';

CREATE OR REPLACE FUNCTION public.bloguploader_publish_v2(
  input_token text,
  input_type text,
  input_description text,
  input_filename text,
  input_media_key text,
  input_media_url text,
  input_content_type text,
  input_media_size bigint,
  input_uploader_name text
)
RETURNS TABLE(
  id uuid, slug text, post_type text, title text, description text,
  filename text, media_key text, media_url text, content_type text,
  media_size bigint, uploader_name text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_title text;
  v_slug text;
  v_uploader_name text := left(btrim(input_uploader_name), 40);
  v_media_prefix constant text := 'https://br-silent-frost-b3chnc64.storage.c-4.ap-southeast-1.aws.neon.tech/apokolips-blog-media/';
BEGIN
  IF NOT public.bloguploader_check_session(input_token) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  IF input_type NOT IN ('image','video','text') THEN
    RAISE EXCEPTION 'invalid post type';
  END IF;
  IF input_description IS NULL OR length(btrim(input_description)) < 1 OR length(input_description) > 20000 THEN
    RAISE EXCEPTION 'description is required and must be at most 20000 characters';
  END IF;
  IF v_uploader_name IS NULL OR v_uploader_name = '' THEN
    RAISE EXCEPTION 'uploader name is required';
  END IF;
  IF input_type = 'text' THEN
    IF input_filename IS NOT NULL OR input_media_key IS NOT NULL OR input_media_url IS NOT NULL
       OR input_content_type IS NOT NULL OR input_media_size IS NOT NULL THEN
      RAISE EXCEPTION 'text posts cannot include media';
    END IF;
  ELSE
    IF input_filename IS NULL OR length(input_filename) < 1 OR length(input_filename) > 255
       OR input_media_key IS NULL OR input_media_key !~ '^posts/[A-Za-z0-9._-]+$'
       OR input_media_url IS DISTINCT FROM (v_media_prefix || input_media_key)
       OR input_media_size IS NULL OR input_media_size < 1 OR input_media_size > 83886080 THEN
      RAISE EXCEPTION 'invalid media metadata';
    END IF;
    IF input_type = 'image' AND input_content_type NOT IN ('image/jpeg','image/png','image/webp','image/avif','image/gif') THEN
      RAISE EXCEPTION 'unsupported image type';
    END IF;
    IF input_type = 'video' AND input_content_type NOT IN ('video/mp4','video/webm','video/quicktime','video/x-m4v','video/ogg') THEN
      RAISE EXCEPTION 'unsupported video type';
    END IF;
  END IF;
  v_title := left(split_part(replace(btrim(input_description), E'\\r', ''), E'\\n', 1), 80);
  IF v_title = '' THEN v_title := CASE WHEN input_type = 'text' THEN 'A new note' ELSE 'A new memory' END; END IF;
  v_slug := 'post-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12);
  RETURN QUERY
    INSERT INTO public.bloguploader_posts AS saved
      (slug, post_type, title, description, filename, media_key, media_url, content_type, media_size, uploader_name)
    VALUES
      (v_slug, input_type, v_title, btrim(input_description), input_filename, input_media_key, input_media_url, input_content_type, input_media_size, v_uploader_name)
    RETURNING saved.id, saved.slug, saved.post_type, saved.title, saved.description,
      saved.filename, saved.media_key, saved.media_url, saved.content_type, saved.media_size,
      saved.uploader_name, saved.created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.bloguploader_publish_v2(text,text,text,text,text,text,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bloguploader_publish_v2(text,text,text,text,text,text,text,bigint,text) TO anonymous, authenticated;
