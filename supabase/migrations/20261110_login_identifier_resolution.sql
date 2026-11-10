-- @mine — Login identifier resolution: username, display name, or e-mail.
--
-- Before this, only `profiles.username` resolved (plus the raw string when it
-- contained '@'), so renaming an account to a person's name changed what the UI
-- showed but not how they signed in.
--
-- Precedence is deliberate:
--   1. username   — unique by constraint
--   2. e-mail     — unique by constraint
--   3. display name — accepted ONLY when exactly one active account has it, so two
--      people called "Mae Ortega" can never resolve to the wrong account (both
--      then fall back to username/e-mail, which are unique).
--
-- Matching ignores case and collapses internal whitespace ("  Mae   Ortega ").

drop function if exists public.resolve_login_email(text);

create function public.resolve_login_email(input_username text)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_key    text := lower(btrim(coalesce(input_username, '')));
  v_spaced text := lower(regexp_replace(btrim(coalesce(input_username, '')), '\s+', ' ', 'g'));
  v_email  text;
  v_matches integer;
begin
  if v_key = '' then
    return null;
  end if;

  -- 1) username
  select p.email into v_email
    from public.profiles p
   where lower(btrim(p.username)) = v_key
     and lower(p.status::text) = 'active'
   limit 1;
  if v_email is not null then
    return v_email;
  end if;

  -- 2) e-mail
  select p.email into v_email
    from public.profiles p
   where lower(btrim(p.email)) = v_key
     and lower(p.status::text) = 'active'
   limit 1;
  if v_email is not null then
    return v_email;
  end if;

  -- 3) display name, only when unambiguous
  select count(distinct p.email) into v_matches
    from public.profiles p
   where lower(regexp_replace(btrim(coalesce(nullif(p.full_name, ''), nullif(p.name, ''), p.username)), '\s+', ' ', 'g')) = v_spaced
     and lower(p.status::text) = 'active';

  if v_matches = 1 then
    select p.email into v_email
      from public.profiles p
     where lower(regexp_replace(btrim(coalesce(nullif(p.full_name, ''), nullif(p.name, ''), p.username)), '\s+', ' ', 'g')) = v_spaced
       and lower(p.status::text) = 'active'
     limit 1;
    return v_email;
  end if;

  return null;
end
$function$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated, service_role;
