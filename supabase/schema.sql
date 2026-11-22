-- Idea Room database schema
-- Run in Supabase → SQL Editor, top to bottom.
-- Dashboard settings (not SQL):
--   Authentication → Sign In / Providers → enable "Allow anonymous sign-ins"
--   (dev only) Email provider → "Confirm email" off

-- ─── 1. Tables ───

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null check (char_length(title) between 1 and 120),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.ideas (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references public.rooms (id) on delete cascade,
  author_id   uuid default auth.uid() references auth.users (id) on delete set null,
  content     text not null check (char_length(content) between 1 and 280),
  is_ai       boolean not null default false,
  vote_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index ideas_room_votes_idx on public.ideas (room_id, vote_count desc, created_at);

create table public.votes (
  idea_id     uuid not null references public.ideas (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (idea_id, user_id)
);

-- ─── 2. Keep ideas.vote_count in sync with votes ───

create or replace function public.sync_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update ideas set vote_count = vote_count + 1 where id = new.idea_id;
  elsif tg_op = 'DELETE' then
    update ideas set vote_count = greatest(vote_count - 1, 0) where id = old.idea_id;
  end if;
  return null;
end;
$$;

create trigger votes_sync_count
after insert or delete on public.votes
for each row execute function public.sync_vote_count();

-- ─── 3. Row Level Security ───

alter table public.rooms enable row level security;
alter table public.ideas enable row level security;
alter table public.votes enable row level security;

-- Rooms
create policy "rooms are readable" on public.rooms
  for select using (true);

create policy "presenters create rooms" on public.rooms
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

create policy "owners delete rooms" on public.rooms
  for delete to authenticated using (owner_id = auth.uid());

-- Ideas
create policy "ideas are readable" on public.ideas
  for select using (true);

create policy "users post their own ideas" on public.ideas
  for insert to authenticated 
  with check (is_ai = false and author_id = auth.uid());

create policy "presenter posts AI ideas" on public.ideas
  for insert to authenticated
  with check (
    is_ai = true and vote_count = 0
    and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid())
  );

alter table public.ideas
  add column author_name text check (char_length(author_name) <= 15);

-- Votes
create policy "votes are readable" on public.votes
  for select using (true);

create policy "vote as yourself" on public.votes
  for insert to authenticated with check (user_id = auth.uid());

create policy "unvote as yourself" on public.votes
  for delete to authenticated using (user_id = auth.uid());

-- ─── 4. Realtime ───

alter publication supabase_realtime add table public.ideas;