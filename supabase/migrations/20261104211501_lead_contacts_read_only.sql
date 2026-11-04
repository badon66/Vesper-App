-- lead_contacts is read only (2026-11-04). Supabase's default privileges gave
-- signed-in people insert, update and delete on the new view as well as
-- select. It is a simple view that runs with its owner's rights, so those
-- would have reached leads around its policies. Only select stays.
revoke insert, update, delete, truncate, references, trigger on public.lead_contacts from authenticated;
revoke all on public.lead_contacts from anon, public;
grant select on public.lead_contacts to authenticated;
