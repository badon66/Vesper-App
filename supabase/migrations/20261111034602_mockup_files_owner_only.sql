-- Round 10 catch-up (Keenan, 2026-11-11): mockups are Keenan's alone, in
-- storage too. The setters' photo policies let a setter read every file in
-- the lead-photos bucket and every lead_photos row, the old mockup slot
-- included, so a setter who listed Keenan's folder could sign a mockup.
-- Now a setter reads a photo file only when it isn't a mockup (not in
-- lead_mockups, and not in the old mockup slot), and never a mockup row.
-- The customer's link is unchanged: a live token signs its own lead's Main
-- and offer pictures and nothing else. Both policies are changed in place,
-- nothing replaced. The function reads both tables past their own
-- policies, which is why it exists: a policy's own subquery would see only
-- what the setter sees, which for mockups is nothing.

create or replace function public.photo_file_is_mockup(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.lead_mockups m where m.storage_path = p_name)
      or exists (select 1 from public.lead_photos p where p.storage_path = p_name and p.slot = 'mockup');
$$;
revoke all on function public.photo_file_is_mockup(text) from public, anon;
grant execute on function public.photo_file_is_mockup(text) to authenticated;

alter policy "sales side reads lead photo files" on storage.objects
  using (
    bucket_id = 'lead-photos'
    and public.is_sales_side()
    and (public.is_owner() or not public.photo_file_is_mockup(name))
  );

alter policy "sales side reads lead photos" on public.lead_photos
  using (public.is_sales_side() and (public.is_owner() or slot is distinct from 'mockup'));
