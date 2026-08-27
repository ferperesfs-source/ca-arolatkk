create or replace function public.set_primecash_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  if p_secret is null or char_length(trim(p_secret)) < 12 or char_length(p_secret) > 500 then
    raise exception 'Secret Key inválida';
  end if;

  select id into secret_id
  from vault.secrets
  where name = 'primecash_secret_key';

  if secret_id is null then
    perform vault.create_secret(trim(p_secret), 'primecash_secret_key', 'PrimeCash API Secret Key');
  else
    perform vault.update_secret(secret_id, trim(p_secret), 'primecash_secret_key', 'PrimeCash API Secret Key');
  end if;
end;
$$;

create or replace function public.get_primecash_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'primecash_secret_key'
  limit 1;
$$;

create or replace function public.has_primecash_secret()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.secrets where name = 'primecash_secret_key'
  );
$$;

revoke all on function public.set_primecash_secret(text) from public, anon, authenticated;
revoke all on function public.get_primecash_secret() from public, anon, authenticated;
revoke all on function public.has_primecash_secret() from public, anon, authenticated;
grant execute on function public.set_primecash_secret(text) to service_role;
grant execute on function public.get_primecash_secret() to service_role;
grant execute on function public.has_primecash_secret() to service_role;
