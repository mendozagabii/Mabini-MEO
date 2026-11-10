-- @mine — Fix (2026-11-10): the "Update Master Password" button never worked.
--
-- Symptom: PATCH /api/auth/unlock returned "permission denied for function
-- set_master_code", so a master code could not be set or changed from the app, and
-- because system_settings was empty the login-screen unlock could never succeed either.
--
-- Cause: the route called set_master_code() with the *user* (anon key + user JWT) client
-- so that auth.uid() would record who changed it — but EXECUTE on that function is
-- granted to postgres/service_role only, so the call was rejected.
--
-- Fix: the route now calls it with the service-role client (it already enforces
-- head_engineer itself) and passes the actor explicitly through p_updated_by.
-- The 2-argument signature is dropped so PostgREST has no ambiguous overload; the new
-- 3-argument function keeps working for 2-argument callers because the new params default.

drop function if exists public.set_master_code(text, text);

create or replace function public.set_master_code(
  p_new text,
  p_current text default null,
  p_updated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if length(btrim(coalesce(p_new, ''))) < 8 then
    raise exception 'The master code must be at least 8 characters long.';
  end if;

  if exists (select 1 from public.system_settings where key = 'master_unlock_code_hash')
     and not public.verify_master_code(coalesce(p_current, '')) then
    raise exception 'The current master code is incorrect.' using errcode = '28000';
  end if;

  insert into public.system_settings (key, value, updated_by)
  values ('master_unlock_code_hash',
          extensions.crypt(btrim(p_new), extensions.gen_salt('bf')),
          coalesce(p_updated_by, auth.uid()))
  on conflict (key) do update
    set value      = excluded.value,
        updated_by = excluded.updated_by,
        updated_at = now();
end
$function$;

-- Same lock-down as the other security-definer RPCs: never callable with the anon key.
revoke all on function public.set_master_code(text, text, uuid) from public;
revoke all on function public.set_master_code(text, text, uuid) from anon, authenticated;
grant execute on function public.set_master_code(text, text, uuid) to service_role;
