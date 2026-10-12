-- Run once in the Supabase SQL editor. Safe to re-run.
-- Access model: one shared board account (see BOARD_EMAIL in js/config.js) signs in with a shared
-- password. Rows record the display name each device chose, not an account.

create table if not exists public.allowed_users (
  email        text primary key check (email = lower(email)),
  display_name text not null
);

-- security definer so policies can read allowed_users without recursing through its own RLS
create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where email = lower(auth.jwt() ->> 'email'));
$$;

create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  storage_path  text not null unique,
  original_name text,
  tags          text[] not null default '{}',
  added_by_name text,
  created_at    timestamptz not null default now()
);

-- Trash: a set deleted_at means the photo is in the trash. The app removes it for good 30 days later.
alter table public.photos add column if not exists deleted_at      timestamptz;
alter table public.photos add column if not exists deleted_by_name text;

create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  author_name text not null check (length(author_name) between 1 and 60),
  body        text not null check (length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);

-- Drawn markings were removed from the app; this drops the table and its data (policies and index go with it).
drop table if exists public.markings;

create index if not exists comments_photo_idx on public.comments (photo_id);

-- Only the signed-in board account gets anything. anon gets nothing.
revoke all on public.allowed_users, public.photos, public.comments from anon;
grant select on public.allowed_users to authenticated;
grant select, insert, update, delete on public.photos, public.comments to authenticated;
grant execute on function public.is_allowed() to authenticated;

alter table public.allowed_users enable row level security;
alter table public.photos        enable row level security;
alter table public.comments      enable row level security;

drop policy if exists "board members read" on public.allowed_users;
create policy "board members read" on public.allowed_users
  for select to authenticated using (public.is_allowed());

drop policy if exists "board members manage photos" on public.photos;
create policy "board members manage photos" on public.photos
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "board members manage comments" on public.comments;
create policy "board members manage comments" on public.comments
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- Private bucket: images are only reachable through short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

drop policy if exists "board members read photo files" on storage.objects;
create policy "board members read photo files" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.is_allowed());
drop policy if exists "board members upload photo files" on storage.objects;
create policy "board members upload photo files" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_allowed());
drop policy if exists "board members delete photo files" on storage.objects;
create policy "board members delete photo files" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_allowed());
