alter table public.gateway_settings
  drop constraint if exists gateway_settings_provider_check;

alter table public.gateway_settings
  add constraint gateway_settings_provider_check
  check (provider in ('primecash', 'titans', 'manual_pix'));

alter table public.gateway_settings
  add column if not exists pix_key text,
  add column if not exists pix_key_type text,
  add column if not exists pix_receiver_name text,
  add column if not exists pix_receiver_city text;

alter table public.gateway_settings
  drop constraint if exists gateway_settings_pix_key_type_check;

alter table public.gateway_settings
  add constraint gateway_settings_pix_key_type_check
  check (pix_key_type is null or pix_key_type in ('random', 'cpf', 'cnpj', 'phone', 'email'));

alter table public.orders
  drop constraint if exists orders_gateway_check;

alter table public.orders
  add constraint orders_gateway_check
  check (gateway is null or gateway in ('primecash', 'titans', 'manual_pix'));

alter table public.orders
  add column if not exists pix_txid text,
  add column if not exists paid_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

create unique index if not exists orders_pix_txid_unique_idx
  on public.orders (pix_txid) where pix_txid is not null;

insert into public.gateway_settings (provider, display_name, active)
values ('manual_pix', 'Pix Manual', false)
on conflict (provider) do nothing;

create or replace function public.set_active_gateway(p_provider text, p_active boolean)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = (select auth.uid())) then
    raise exception 'Acesso administrativo não autorizado';
  end if;
  if p_provider not in ('primecash', 'titans', 'manual_pix') then raise exception 'Gateway inválido'; end if;
  if p_active then
    update public.gateway_settings set active = false, updated_at = now() where provider <> p_provider and active;
  end if;
  update public.gateway_settings set active = p_active, updated_at = now() where provider = p_provider;
end;
$$;

revoke all on function public.set_active_gateway(text, boolean) from public, anon, authenticated;
grant execute on function public.set_active_gateway(text, boolean) to authenticated;
