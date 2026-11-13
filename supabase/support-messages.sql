-- ===========================================================================
-- Industry Bank — Live support messages
-- Run this entire file in the Supabase SQL Editor and click "Run".
-- Additive only: safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Admin helper — the one support account allowed to see every session.
--    Uses the verified email in the JWT, not the user-editable profiles.email.
-- ---------------------------------------------------------------------------
create or replace function public.is_support_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@industrybank.test';
$$;

grant execute on function public.is_support_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Support messages — one row per chat bubble.
-- ---------------------------------------------------------------------------
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  sender text not null check (sender in ('user', 'ai', 'human')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_user_created_idx
  on public.support_messages (user_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
--    Customers see/insert only their own conversation.
--    The admin can read every conversation and reply as a human.
-- ---------------------------------------------------------------------------
alter table public.support_messages enable row level security;

drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select to authenticated
  using (user_id = auth.uid() or public.is_support_admin());

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    (user_id = auth.uid() and sender in ('user', 'ai'))
    or (public.is_support_admin() and sender = 'human')
  );

drop policy if exists support_messages_delete_admin on public.support_messages;
create policy support_messages_delete_admin on public.support_messages
  for delete to authenticated
  using (public.is_support_admin());

-- The admin console groups sessions by customer email, so the support account
-- must be able to read every profile. Existing "read own profile" policy stays.
drop policy if exists profiles_select_support_admin on public.profiles;
create policy profiles_select_support_admin on public.profiles
  for select to authenticated
  using (public.is_support_admin());

-- ---------------------------------------------------------------------------
-- 3. Realtime — stream every INSERT to subscribed clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end $$;

-- Ask PostgREST to pick up the new table and policies immediately.
notify pgrst, 'reload schema';
