-- ===========================================================================
-- Industry Bank — Supabase schema
-- Paste this entire file into the Supabase SQL Editor and click "Run".
-- Safe to run more than once (idempotent).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Profiles — one row per authenticated person (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default 'New Customer',
  phone_number text,
  created_at timestamptz not null default now()
);

-- KYC / identity verification fields.
-- Safe to re-run on an existing database.
alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists date_of_birth date,
  add column if not exists address text,
  add column if not exists id_front_url text,
  add column if not exists id_back_url text;

-- ---------------------------------------------------------------------------
-- 2. Accounts — checking / savings / credit, owned by a profile
--    account_number is a unique 10-digit number used to receive transfers.
--    routing_number is shared by every demo account.
-- ---------------------------------------------------------------------------
create sequence if not exists public.account_number_seq start with 1000000001;

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('checking', 'savings', 'credit')),
  name text not null,
  mask text not null,
  account_number text not null unique
    default lpad(nextval('public.account_number_seq')::text, 10, '0'),
  routing_number text not null default '021000021',
  balance_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- Add the transfer-number columns to databases created before this version.
alter table public.accounts
  add column if not exists account_number text,
  add column if not exists routing_number text;

-- Backfill existing rows. The sequence guarantees unique 10-digit numbers.
update public.accounts
set routing_number = '021000021'
where routing_number is null;

update public.accounts
set account_number = lpad(nextval('public.account_number_seq')::text, 10, '0')
where account_number is null;

alter table public.accounts
  alter column account_number set default lpad(nextval('public.account_number_seq')::text, 10, '0'),
  alter column routing_number set default '021000021';

alter table public.accounts
  alter column account_number set not null,
  alter column routing_number set not null;

create unique index if not exists accounts_account_number_key
  on public.accounts (account_number);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

-- ---------------------------------------------------------------------------
-- 3. Transactions — the ledger. Two rows are written per transfer, one for
--    each person, so both dashboards show the movement.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete cascade,
  counterparty_account_id uuid references public.accounts (id) on delete set null,
  merchant text not null,
  category text not null default 'Transfer',
  memo text,
  amount_cents bigint not null,
  confirmation text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — a person only ever reads their own rows.
--    All writes to balances go through the transfer function below, which is
--    SECURITY DEFINER, so no client-side insert/update policies are needed.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- A signed-in client may only change editable profile columns. The id and
-- created_at columns stay server-owned. Include the KYC URL columns because
-- the signup flow attaches them after the account is created.
revoke update on public.profiles from anon, authenticated;
grant update (
  full_name,
  email,
  phone_number,
  date_of_birth,
  address,
  id_front_url,
  id_back_url
) on public.profiles to authenticated;

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select using (user_id = auth.uid());

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. New user bootstrap — when someone signs up, create their profile and the
--    three starting accounts. Balances match src/data/seed.ts.
--      checking  900,000.00  ->  90,000,000 cents
--      savings   100,565.00  ->  10,056,500 cents   (total available 1,000,565.00)
--      credit    -1,284.32   ->    -128,432 cents
-- ---------------------------------------------------------------------------
create or replace function public.generate_account_number()
returns text
language sql
volatile
set search_path = public
as $$
  select lpad(nextval('public.account_number_seq')::text, 10, '0');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles
    (id, email, full_name, date_of_birth, address, id_front_url, id_back_url, phone_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New Customer'),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    nullif(new.raw_user_meta_data ->> 'address', ''),
    nullif(new.raw_user_meta_data ->> 'id_front_url', ''),
    nullif(new.raw_user_meta_data ->> 'id_back_url', ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone_number', ''),
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      nullif(new.phone, '')
    )
  )
  on conflict (id) do nothing;

  insert into public.accounts
    (user_id, kind, name, mask, account_number, routing_number, balance_cents)
  values
    (new.id, 'checking', 'Everyday Checking', '4821', public.generate_account_number(), '021000021', 90000000),
    (new.id, 'savings', 'High-Yield Savings', '9930', public.generate_account_number(), '021000021', 10056500),
    (new.id, 'credit', 'Industry Credit Card', '2214', public.generate_account_number(), '021000021', -128432)
  on conflict (user_id, kind) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 6. Atomic transfer — debit one account and credit another in a single
--    transaction. Called from the client with supabase.rpc("transfer_funds").
-- ---------------------------------------------------------------------------
drop function if exists public.transfer_funds(uuid, text, bigint, text);

create or replace function public.transfer_funds(
  p_from_account_id uuid,
  p_recipient_account_number text,
  p_amount_cents bigint,
  p_memo text default null
)
returns table (confirmation_code text, new_balance_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_id uuid := auth.uid();
  v_sender public.profiles;
  v_from public.accounts;
  v_to public.accounts;
  v_recipient public.profiles;
  v_recipient_account_number text;
  v_category text := coalesce(nullif(trim(p_memo), ''), 'Transfer');
  v_confirmation text;
begin
  if v_sender_id is null then
    raise exception 'You must be signed in to send money.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount greater than $0.00.';
  end if;

  v_recipient_account_number :=
    regexp_replace(coalesce(p_recipient_account_number, ''), '\D', '', 'g');

  if length(v_recipient_account_number) <> 10 then
    raise exception 'Enter a valid 10-digit account number.';
  end if;

  select * into v_from
  from public.accounts
  where id = p_from_account_id and user_id = v_sender_id
  for update;

  if not found then
    raise exception 'Choose an account to transfer from.';
  end if;

  if v_from.kind = 'credit' then
    raise exception 'Transfers must come from a checking or savings account.';
  end if;

  if v_from.balance_cents < p_amount_cents then
    raise exception 'That amount is more than the available balance.';
  end if;

  select * into v_to
  from public.accounts
  where account_number = v_recipient_account_number
  for update;

  if not found then
    raise exception 'No Industry Bank account matches that account number.';
  end if;

  if v_to.user_id = v_sender_id then
    raise exception 'You cannot send money to your own account.';
  end if;

  select * into v_sender from public.profiles where id = v_sender_id;
  select * into v_recipient from public.profiles where id = v_to.user_id;

  if not found then
    raise exception 'The recipient profile could not be found.';
  end if;

  update public.accounts
    set balance_cents = balance_cents - p_amount_cents
    where id = v_from.id;

  update public.accounts
    set balance_cents = balance_cents + p_amount_cents
    where id = v_to.id;

  v_confirmation :=
    'IB' || lpad((100000 + floor(random() * 900000))::int::text, 6, '0');

  insert into public.transactions
    (user_id, account_id, counterparty_account_id, merchant, category, memo, amount_cents, confirmation)
  values
    (v_sender_id, v_from.id, v_to.id, v_recipient.full_name, v_category, p_memo, -p_amount_cents, v_confirmation),
    (v_recipient.id, v_to.id, v_from.id, v_sender.full_name, v_category, p_memo, p_amount_cents, v_confirmation);

  return query
    select v_confirmation, (v_from.balance_cents - p_amount_cents)::bigint;
end;
$$;

grant execute on function public.transfer_funds(uuid, text, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reset helper — restores the signed-in person's starting balances.
-- ---------------------------------------------------------------------------
create or replace function public.reset_my_accounts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.accounts
    set balance_cents = case kind
      when 'checking' then 90000000
      when 'savings'  then 10056500
      when 'credit'   then -128432
      else balance_cents
    end
  where user_id = auth.uid();

  delete from public.transactions where user_id = auth.uid();
end;
$$;

grant execute on function public.reset_my_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Realtime — stream balance and ledger changes to every connected browser.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts'
  ) then
    alter publication supabase_realtime add table public.accounts;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Storage — KYC ID images in the "id-cards" bucket.
--    The bucket is public so the stored URLs resolve directly. Uploads are
--    limited to signed-in users. For production, prefer a private bucket and
--    signed URLs instead of public links.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('id-cards', 'id-cards', true)
on conflict (id) do nothing;

drop policy if exists id_cards_read on storage.objects;
create policy id_cards_read on storage.objects
  for select using (bucket_id = 'id-cards');

drop policy if exists id_cards_insert on storage.objects;
create policy id_cards_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'id-cards');

drop policy if exists id_cards_update on storage.objects;
create policy id_cards_update on storage.objects
  for update to authenticated
  using (bucket_id = 'id-cards')
  with check (bucket_id = 'id-cards');

drop policy if exists id_cards_delete on storage.objects;
create policy id_cards_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'id-cards');

-- Ask PostgREST to pick up new columns and functions immediately.
notify pgrst, 'reload schema';
