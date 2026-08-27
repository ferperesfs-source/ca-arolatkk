alter table public.orders
  add column if not exists payment_reference uuid,
  add column if not exists gateway text,
  add column if not exists gateway_checkout_id text,
  add column if not exists gateway_status text;

create unique index if not exists orders_payment_reference_key
  on public.orders (payment_reference)
  where payment_reference is not null;

alter table public.orders drop constraint if exists orders_gateway_check;
alter table public.orders add constraint orders_gateway_check
  check (gateway is null or gateway in ('primecash'));

create table if not exists public.gateway_settings (
  provider text primary key check (provider in ('primecash')),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gateway_settings enable row level security;

drop policy if exists "admins read gateway settings" on public.gateway_settings;
create policy "admins read gateway settings" on public.gateway_settings
for select to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

drop policy if exists "admins update gateway settings" on public.gateway_settings;
create policy "admins update gateway settings" on public.gateway_settings
for update to authenticated using (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.admin_users au where au.user_id = (select auth.uid()))
);

revoke all on public.gateway_settings from anon, authenticated;
grant select, update on public.gateway_settings to authenticated;

insert into public.gateway_settings (provider, display_name, active)
values ('primecash', 'PrimeCash Brasil', true)
on conflict (provider) do nothing;
