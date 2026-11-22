-- Android FCM device registrations for the dedicated Apokolips Group Chat.
-- Additive only: existing guest, message, and attachment rows are not changed.

CREATE TABLE IF NOT EXISTS public.chat_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.chat_guests(id) ON DELETE CASCADE,
  device_id uuid NOT NULL UNIQUE,
  fcm_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_push_device_token_length CHECK (char_length(fcm_token) BETWEEN 50 AND 4096)
);

CREATE INDEX IF NOT EXISTS chat_push_devices_guest_idx
  ON public.chat_push_devices (guest_id);

CREATE TABLE IF NOT EXISTS public.chat_push_dispatches (
  message_id uuid PRIMARY KEY REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_push_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  dispatch_secret_hash text NOT NULL CHECK (dispatch_secret_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.chat_push_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_push_dispatches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_push_settings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.chat_push_register_device(
  p_guest_token text,
  p_device_id uuid,
  p_fcm_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest_id uuid;
BEGIN
  SELECT g.id INTO v_guest_id
  FROM public.chat_guests g
  WHERE p_guest_token ~ '^[A-Za-z0-9_-]{40,60}$'
    AND g.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex');

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  IF p_device_id IS NULL OR p_fcm_token IS NULL OR char_length(p_fcm_token) NOT BETWEEN 50 AND 4096 THEN
    RAISE EXCEPTION 'invalid_push_device' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.chat_push_devices
  WHERE fcm_token = p_fcm_token AND device_id <> p_device_id;

  INSERT INTO public.chat_push_devices (guest_id, device_id, fcm_token)
  VALUES (v_guest_id, p_device_id, p_fcm_token)
  ON CONFLICT (device_id) DO UPDATE
    SET guest_id = EXCLUDED.guest_id,
        fcm_token = EXCLUDED.fcm_token,
        updated_at = now(),
        last_seen_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.chat_push_unregister_device(
  p_guest_token text,
  p_device_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest_id uuid;
BEGIN
  SELECT g.id INTO v_guest_id
  FROM public.chat_guests g
  WHERE p_guest_token ~ '^[A-Za-z0-9_-]{40,60}$'
    AND g.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex');

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.chat_push_devices
  WHERE guest_id = v_guest_id AND device_id = p_device_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.chat_push_dispatch_message(
  p_message_id uuid,
  p_dispatch_secret text
)
RETURNS TABLE (
  fcm_token text,
  notification_title text,
  notification_body text,
  message_type text,
  message_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_message public.chat_messages%ROWTYPE;
  v_media_kind text;
BEGIN
  IF p_dispatch_secret IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.chat_push_settings s
    WHERE s.id = true
      AND s.dispatch_secret_hash = encode(digest(p_dispatch_secret, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT m.* INTO v_message
  FROM public.chat_messages m
  WHERE m.id = p_message_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_push_dispatches (message_id)
  VALUES (p_message_id)
  ON CONFLICT (message_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a.media_kind INTO v_media_kind
  FROM public.chat_message_attachments a
  WHERE a.message_id = p_message_id
  ORDER BY a.created_at
  LIMIT 1;

  RETURN QUERY
  SELECT
    d.fcm_token,
    COALESCE(NULLIF(v_message.author_nickname, ''), 'Apokolips member')::text,
    CASE
      WHEN v_message.message_type = 'text'
        THEN left(regexp_replace(COALESCE(v_message.body, ''), E'[\\r\\n\\t]+', ' ', 'g'), 160)
      WHEN v_message.message_type = 'voice' OR v_media_kind = 'voice'
        THEN 'Voice message'
      WHEN v_media_kind = 'image'
        THEN 'Photo'
      WHEN v_media_kind = 'video'
        THEN 'Video'
      ELSE 'Attachment'
    END::text,
    v_message.message_type,
    v_message.id
  FROM public.chat_push_devices d
  WHERE d.guest_id <> v_message.guest_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.chat_push_remove_invalid_token(
  p_dispatch_secret text,
  p_fcm_token text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_dispatch_secret IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.chat_push_settings s
    WHERE s.id = true
      AND s.dispatch_secret_hash = encode(digest(p_dispatch_secret, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.chat_push_devices WHERE fcm_token = p_fcm_token;
END
$function$;

REVOKE ALL ON FUNCTION public.chat_push_register_device(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_push_unregister_device(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_push_dispatch_message(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.chat_push_remove_invalid_token(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.chat_push_register_device(text, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.chat_push_unregister_device(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.chat_push_dispatch_message(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.chat_push_remove_invalid_token(text, text) TO anon;
