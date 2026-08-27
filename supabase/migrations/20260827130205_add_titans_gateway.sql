alter table public.orders drop constraint if exists orders_gateway_check;
alter table public.orders add constraint orders_gateway_check
  check (gateway is null or gateway in ('primecash', 'titans'));

alter table public.gateway_settings drop constraint if exists gateway_settings_provider_check;
alter table public.gateway_settings add constraint gateway_settings_provider_check
  check (provider in ('primecash', 'titans'));

insert into public.gateway_settings (provider, display_name, active)
values ('titans', 'Titans Gateway', false)
on conflict (provider) do update set display_name = excluded.display_name;

create unique index if not exists gateway_settings_single_active_idx
  on public.gateway_settings ((active)) where active;

create or replace function public.set_active_gateway(p_provider text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  ) then
    raise exception 'Acesso administrativo não autorizado';
  end if;
  if p_provider not in ('primecash', 'titans') then
    raise exception 'Gateway inválido';
  end if;
  if p_active then
    update public.gateway_settings set active = false, updated_at = now() where provider <> p_provider and active;
  end if;
  update public.gateway_settings set active = p_active, updated_at = now() where provider = p_provider;
end;
$$;

create or replace function public.set_titans_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare secret_id uuid;
begin
  if p_secret is null or char_length(trim(p_secret)) < 12 or char_length(p_secret) > 500 then
    raise exception 'API Key inválida';
  end if;
  select id into secret_id from vault.secrets where name = 'titans_api_key';
  if secret_id is null then
    perform vault.create_secret(trim(p_secret), 'titans_api_key', 'Titans Gateway Payment API Key');
  else
    perform vault.update_secret(secret_id, trim(p_secret), 'titans_api_key', 'Titans Gateway Payment API Key');
  end if;
end;
$$;

create or replace function public.get_titans_secret()
returns text language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'titans_api_key' limit 1; $$;

create or replace function public.has_titans_secret()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from vault.secrets where name = 'titans_api_key'); $$;

create or replace function public.set_titans_webhook_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare secret_id uuid;
begin
  if p_secret is null or char_length(trim(p_secret)) < 12 or char_length(p_secret) > 500 then
    raise exception 'Webhook Secret inválido';
  end if;
  select id into secret_id from vault.secrets where name = 'titans_webhook_secret';
  if secret_id is null then
    perform vault.create_secret(trim(p_secret), 'titans_webhook_secret', 'Titans Gateway Webhook HMAC Secret');
  else
    perform vault.update_secret(secret_id, trim(p_secret), 'titans_webhook_secret', 'Titans Gateway Webhook HMAC Secret');
  end if;
end;
$$;

create or replace function public.get_titans_webhook_secret()
returns text language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'titans_webhook_secret' limit 1; $$;

revoke all on function public.set_active_gateway(text, boolean) from public, anon, authenticated;
grant execute on function public.set_active_gateway(text, boolean) to authenticated;
revoke all on function public.set_titans_secret(text) from public, anon, authenticated;
revoke all on function public.get_titans_secret() from public, anon, authenticated;
revoke all on function public.has_titans_secret() from public, anon, authenticated;
revoke all on function public.set_titans_webhook_secret(text) from public, anon, authenticated;
revoke all on function public.get_titans_webhook_secret() from public, anon, authenticated;
grant execute on function public.set_titans_secret(text) to service_role;
grant execute on function public.get_titans_secret() to service_role;
grant execute on function public.has_titans_secret() to service_role;
grant execute on function public.set_titans_webhook_secret(text) to service_role;
grant execute on function public.get_titans_webhook_secret() to service_role;
