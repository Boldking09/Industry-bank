-- ===========================================================================
-- Industry Bank — Profile & account upgrade
-- Run this whole file in the Supabase SQL Editor and click "Run".
-- Additive only: safe to run more than once.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Phone number on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists phone_number text;

-- Backfill phone numbers Supabase Auth already knows about.
update public.profiles p
set phone_number = u.phone
from auth.users u
where u.id = p.id
  and p.phone_number is null
  and u.phone is not null
  and btrim(u.phone) <> '';

-- ---------------------------------------------------------------------------
-- 2. Keep the signup trigger in sync (profile + the three starting accounts)
--    Phone is captured from metadata when present, then from auth.users.phone.
-- ---------------------------------------------------------------------------
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
-- 3. Backfill every account with a unique 10-digit account number and a
--    9-digit routing number. Existing valid values are left untouched.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_number text;
begin
  for r in
    select id
    from public.accounts
    where account_number is null
       or account_number !~ '^[0-9]{10}$'
       or length(account_number) <> 10
  loop
    -- The sequence guarantees unique values; the loop is a safety net.
    loop
      v_number := lpad(nextval('public.account_number_seq')::text, 10, '0');
      exit when not exists (
        select 1 from public.accounts where account_number = v_number
      );
    end loop;

    update public.accounts set account_number = v_number where id = r.id;
  end loop;
end $$;

update public.accounts
set routing_number = '021000021'
where routing_number is null
   or routing_number !~ '^[0-9]{9}$'
   or length(routing_number) <> 9;

alter table public.accounts
  alter column account_number set not null,
  alter column routing_number set not null;

create unique index if not exists accounts_account_number_key
  on public.accounts (account_number);

-- ---------------------------------------------------------------------------
-- 4. Seed John's balances: $1,000,000 + $800,000 + $200,000 = $2,000,000.
--    Missing account rows are created; existing rows are updated in place.
-- ---------------------------------------------------------------------------
do $$
declare
  v_user_id uuid;
begin
  select id
  into v_user_id
  from public.profiles
  where lower(email) = lower('johnrex3030@gmail.com')
  limit 1;

  if v_user_id is null then
    raise notice 'No profile found for johnrex3030@gmail.com. Sign that user up first, then re-run this script.';
    return;
  end if;

  insert into public.accounts
    (user_id, kind, name, mask, account_number, routing_number, balance_cents)
  values
    (v_user_id, 'checking', 'Everyday Checking', '4821', public.generate_account_number(), '021000021', 100000000),
    (v_user_id, 'savings', 'High-Yield Savings', '9930', public.generate_account_number(), '021000021', 80000000),
    (v_user_id, 'credit', 'Industry Credit Card', '2214', public.generate_account_number(), '021000021', 20000000)
  on conflict (user_id, kind) do update
    set balance_cents = excluded.balance_cents;

  update public.accounts
  set balance_cents = case kind
    when 'checking' then 100000000
    when 'savings'  then 80000000
    when 'credit'   then 20000000
    else balance_cents
  end
  where user_id = v_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Security: RLS stays enabled. Users may only update their own profile row,
--    and the authenticated role may only touch the editable profile columns.
--    The id and created_at columns cannot be changed by a signed-in client.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

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

-- Ask PostgREST to pick up the new column and policies immediately.
notify pgrst, 'reload schema';
