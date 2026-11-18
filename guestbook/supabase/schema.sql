-- =====================================================================
-- romanserius.com guestbook
--
-- Lives in its own schema, "guestbook", in the same Supabase project as
-- Haikudle. Visitors sign in anonymously (with the Turnstile check), the
-- same way Haikudle players do, so a Haikudle player is already signed in.
--
-- Rules (all enforced here, not just in the page):
--   * name 1-40 characters, message 1-600, optional "from" (place or
--     handle) up to 40, optional website (http/https only).
--   * one entry per visitor every 10 minutes, at most 3 a day.
--   * entries show right away. To take one down, set hidden = true in
--     Table Editor -> guestbook.entries (or delete the row).
--   * visitors can delete their own entries.
--
-- Safe to run again: it only creates what's missing and resets functions
-- and grants.
--
-- One-time setting: add "guestbook" to Exposed schemas
-- (Project Settings -> Data API), next to "haikudle".
-- =====================================================================

create schema if not exists guestbook;

create table if not exists guestbook.entries (
  id         bigint generated always as identity primary key,
  author     uuid references auth.users (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 40),
  place      text check (char_length(place) between 1 and 40),
  website    text check (char_length(website) <= 200 and website ~* '^https?://[^\s<>"]+$'),
  message    text not null check (char_length(message) between 1 and 600),
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists entries_author_time on guestbook.entries (author, created_at desc);
create index if not exists entries_visible on guestbook.entries (id desc) where not hidden;

alter table guestbook.entries enable row level security;
-- No policies on purpose: nobody reads or writes the table directly.
-- Everything goes through the functions below.

-- ---------------------------------------------------------------------
-- Read: newest first, 30 at a time. p_before = id of the last entry you
-- have (null for the first page).
-- ---------------------------------------------------------------------
create or replace function guestbook.list_entries(p_before bigint default null, p_limit int default 30)
returns table (id bigint, name text, place text, website text, message text,
               created_at timestamptz, mine boolean)
language sql stable security definer
set search_path = guestbook, pg_temp
as $$
  select e.id, e.name, e.place, e.website, e.message, e.created_at,
         (auth.uid() is not null and e.author = auth.uid())
  from guestbook.entries e
  where not e.hidden
    and (p_before is null or e.id < p_before)
  order by e.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function guestbook.entry_count()
returns bigint
language sql stable security definer
set search_path = guestbook, pg_temp
as $$ select count(*) from guestbook.entries where not hidden; $$;

-- ---------------------------------------------------------------------
-- Write
-- ---------------------------------------------------------------------
create or replace function guestbook.sign(p_name text, p_message text,
                                          p_place text default null,
                                          p_website text default null)
returns bigint
language plpgsql volatile security definer
set search_path = guestbook, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := nullif(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
  v_place   text := nullif(btrim(regexp_replace(coalesce(p_place, ''), '\s+', ' ', 'g')), '');
  v_website text := nullif(btrim(coalesce(p_website, '')), '');
  -- keep line breaks, trim the ends, squash runs of blank lines
  v_message text := nullif(btrim(regexp_replace(replace(coalesce(p_message, ''), E'\r', ''), E'\n{3,}', E'\n\n', 'g')), '');
  v_id      bigint;
begin
  if v_uid is null then
    raise exception 'Please refresh the page and try again (not signed in).';
  end if;
  if v_name is null then raise exception 'Please add your name.'; end if;
  if v_message is null then raise exception 'Please write a message.'; end if;
  if char_length(v_name) > 40 then raise exception 'Names can be up to 40 characters.'; end if;
  if v_place is not null and char_length(v_place) > 40 then raise exception '"From" can be up to 40 characters.'; end if;
  if char_length(v_message) > 600 then raise exception 'Messages can be up to 600 characters.'; end if;

  if v_website is not null then
    if v_website !~* '^https?://' then v_website := 'https://' || v_website; end if;
    if char_length(v_website) > 200 or v_website !~* '^https?://[^\s<>"]+\.[^\s<>"]+$' then
      raise exception 'That website address doesn''t look right.';
    end if;
  end if;

  if exists (select 1 from guestbook.entries
             where author = v_uid and created_at > now() - interval '10 minutes') then
    raise exception 'Thanks! You can sign again in a few minutes.';
  end if;
  if (select count(*) from guestbook.entries
      where author = v_uid and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Thanks! That''s the limit for today. Come back tomorrow.';
  end if;

  insert into guestbook.entries (author, name, place, website, message)
  values (v_uid, v_name, v_place, v_website, v_message)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function guestbook.remove_mine(p_id bigint)
returns boolean
language plpgsql volatile security definer
set search_path = guestbook, pg_temp
as $$
begin
  if auth.uid() is null then return false; end if;
  delete from guestbook.entries where id = p_id and author = auth.uid();
  return found;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant usage on schema guestbook to anon, authenticated;
revoke all on all tables    in schema guestbook from anon, authenticated, public;
revoke all on all sequences in schema guestbook from anon, authenticated, public;
revoke all on all functions in schema guestbook from anon, authenticated, public;

grant execute on function guestbook.list_entries(bigint, int)        to anon, authenticated;
grant execute on function guestbook.entry_count()                    to anon, authenticated;
grant execute on function guestbook.sign(text, text, text, text)     to authenticated;
grant execute on function guestbook.remove_mine(bigint)              to authenticated;
-- (Supabase anonymous sign-ins use the "authenticated" role.)
