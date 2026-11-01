-- M1 follow-up: trigger functions are not API endpoints.
-- Why: Supabase's security advisor flagged that anon and authenticated could
-- call the SECURITY DEFINER trigger functions through /rest/v1/rpc. Triggers
-- fire regardless of EXECUTE grants, so taking the grants away changes
-- nothing for the app. Auth's own role keeps EXECUTE on the two functions
-- its triggers use.
-- The advisor also reports current_user_role() and is_owner() as callable by
-- signed-in users. That is deliberate: RLS policies run as the signed-in
-- user and need to call them. They return only the caller's own role.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.protect_owner_profile() from public, anon, authenticated;

grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_user_email_change() to supabase_auth_admin;
