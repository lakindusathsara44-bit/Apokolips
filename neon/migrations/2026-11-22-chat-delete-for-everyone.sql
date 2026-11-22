-- One-hour, sender-only Delete for Everyone for the single public Group Chat.
-- The database clock and row lock are authoritative; client-side visibility is only UX.

CREATE OR REPLACE FUNCTION public.chat_delete_message(p_guest_token text, p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_guest_id uuid;
  v_message_guest_id uuid;
  v_created_at timestamptz;
BEGIN
  SELECT g.id INTO v_guest_id
  FROM public.chat_guests g
  WHERE p_guest_token ~ '^[A-Za-z0-9_-]{40,60}$'
    AND g.guest_token_hash = encode(digest(p_guest_token, 'sha256'), 'hex');

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  SELECT m.guest_id, m.created_at
    INTO v_message_guest_id, v_created_at
  FROM public.chat_messages m
  WHERE m.id = p_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_message_guest_id <> v_guest_id THEN
    RAISE EXCEPTION 'message_not_owned' USING ERRCODE = '42501';
  END IF;

  IF v_created_at < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'delete_window_expired' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.chat_messages
  WHERE id = p_message_id AND guest_id = v_guest_id;

  RETURN FOUND;
END
$function$;

REVOKE ALL ON FUNCTION public.chat_delete_message(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_delete_message(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.chat_delete_message(text, uuid) TO anonymous;
