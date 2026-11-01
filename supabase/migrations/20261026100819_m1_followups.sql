-- M1 follow-ups: GST number, owner-set passwords, role from metadata, ending sessions.
-- Why: the owner sets every non-owner password and can reset it, which must end
-- that person's open sessions; People gets an extensible role picker; Settings
-- gets the GST number for formal documents. Applied through the Supabase
-- connector as migration "m1_followups".

-- 1. GST number, printed on the quote PDF and later invoices when GST is on.
alter table public.settings add column gst_number text;

-- 2. The forced first-sign-in password change is gone. Strip its flag from any
-- account that still carries it.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'must_set_password'
where raw_user_meta_data ? 'must_set_password';

-- 3. The sign-up trigger honours a non-owner role passed in user metadata, so a
-- new role appears in People by adding it to the assignable list in code. The
-- owner is still decided by email alone. Privileges on the function are kept.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := meta->>'role';
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'phone'), ''),
    case
      when lower(new.email) = 'info@vesperlighting.ca' then 'owner'::public.user_role
      when wanted in ('sales', 'crew') then wanted::public.user_role
      else 'sales'::public.user_role
    end
  );
  return new;
end;
$$;

-- 4. Ends every open session for one non-owner user. Called with the service
-- role from owner-only server actions after a password reset or a
-- deactivation. With the session rows gone the Auth server rejects the
-- person's access token and refresh token at once.
create or replace function public.end_user_sessions(target_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended integer;
begin
  if exists (select 1 from public.profiles where id = target_user and role = 'owner') then
    raise exception 'The owner''s sessions are not ended this way';
  end if;
  delete from auth.refresh_tokens where user_id = target_user::text;
  delete from auth.sessions where user_id = target_user;
  get diagnostics ended = row_count;
  return ended;
end;
$$;

revoke all on function public.end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_user_sessions(uuid) to service_role;
