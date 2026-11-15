-- Enforce rate limits inside PostgreSQL so public Data API writes cannot bypass them.
create or replace function public.apokolips_blog_enforce_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  action_name text;
  max_requests integer;
  window_minutes integer;
  current_count integer;
begin
  if tg_table_name = 'apokolips_blog_comments' then
    action_name := 'comment'; max_requests := 5; window_minutes := 10;
  else
    action_name := 'reaction'; max_requests := 30; window_minutes := 10;
  end if;
  insert into public.apokolips_blog_rate_limits(visitor_id, action, window_started_at, request_count)
  values (new.visitor_id, action_name, now(), 1)
  on conflict (visitor_id, action) do update
  set window_started_at = case
        when public.apokolips_blog_rate_limits.window_started_at < now() - (window_minutes * interval '1 minute') then now()
        else public.apokolips_blog_rate_limits.window_started_at end,
      request_count = case
        when public.apokolips_blog_rate_limits.window_started_at < now() - (window_minutes * interval '1 minute') then 1
        else public.apokolips_blog_rate_limits.request_count + 1 end
  where public.apokolips_blog_rate_limits.window_started_at < now() - (window_minutes * interval '1 minute')
     or public.apokolips_blog_rate_limits.request_count < max_requests
  returning request_count into current_count;
  if current_count is null then
    raise exception using errcode = 'P0001', message = 'Blog rate limit exceeded. Please wait before trying again.';
  end if;
  return new;
end;
$$;

drop trigger if exists apokolips_blog_comment_rate_limit on public.apokolips_blog_comments;
create trigger apokolips_blog_comment_rate_limit before insert on public.apokolips_blog_comments
for each row execute function public.apokolips_blog_enforce_rate_limit();

drop trigger if exists apokolips_blog_reaction_rate_limit on public.apokolips_blog_reactions;
create trigger apokolips_blog_reaction_rate_limit before insert on public.apokolips_blog_reactions
for each row execute function public.apokolips_blog_enforce_rate_limit();
