-- Round 17 part 1 (Keenan, 2026-11-12): the Christmas banner by real dates.
-- The fixed September 1 to November 30 window is replaced by three dates
-- Keenan sets in Settings, Pricing: book by for white track, book by for a
-- colour-matched track, and the end of the season. Each customer's link
-- shows the date for their own track colour; after it, until the season
-- ends, a line that promises nothing; from the day after, no banner. The
-- banner's words stay Keenan's to edit in Settings, Customer quote page.
-- Additive: new columns with Keenan's own words as defaults, and this year's
-- dates set on the one settings row. The old heading and words columns stay
-- (no longer shown).

alter table public.settings
  add column if not exists christmas_book_by_white date,
  add column if not exists christmas_book_by_colour date,
  add column if not exists christmas_season_end date,
  add column if not exists christmas_banner_book_by text not null default 'Book by {date} to be lit up for Christmas.'
    check (char_length(christmas_banner_book_by) between 1 and 120),
  add column if not exists christmas_banner_white text not null default 'White track is in stock and we install on any good-weather day.'
    check (char_length(christmas_banner_white) <= 300),
  add column if not exists christmas_banner_colour text not null default 'Your colour-matched track takes about a week to prepare, and we install on any good-weather day.'
    check (char_length(christmas_banner_colour) <= 300),
  add column if not exists christmas_banner_no_colour text not null default 'A custom track colour needs about a week more.'
    check (char_length(christmas_banner_no_colour) <= 300),
  add column if not exists christmas_banner_after text not null default 'We can''t promise Christmas now, but we install on every good-weather day all winter. Book now and we''ll get you lit up as soon as we can.'
    check (char_length(christmas_banner_after) <= 300);

update public.settings
   set christmas_book_by_white = date '2026-12-15',
       christmas_book_by_colour = date '2026-12-08',
       christmas_season_end = date '2026-12-24'
 where id = 1
   and christmas_book_by_white is null
   and christmas_book_by_colour is null
   and christmas_season_end is null;
