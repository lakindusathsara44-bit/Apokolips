-- Refresh the PostgREST schema cache used by Neon Data API.
-- Apply after the RLS migration so newly-created public RPCs are discoverable.
NOTIFY pgrst, 'reload schema';
