drop policy if exists "Admins can read PushCut endpoints" on public.pushcut_endpoints;
create policy "Admins can read PushCut endpoints" on public.pushcut_endpoints
for select to authenticated using (
  exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

drop policy if exists "Admins can read PushCut deliveries" on public.pushcut_deliveries;
create policy "Admins can read PushCut deliveries" on public.pushcut_deliveries
for select to authenticated using (
  exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

drop policy if exists "Admins can read marketing integrations" on public.marketing_integrations;
create policy "Admins can read marketing integrations" on public.marketing_integrations
for select to authenticated using (
  exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

drop policy if exists "Admins can read marketing deliveries" on public.marketing_deliveries;
create policy "Admins can read marketing deliveries" on public.marketing_deliveries
for select to authenticated using (
  exists (select 1 from public.admin_users where user_id = (select auth.uid()))
);

create index if not exists marketing_deliveries_integration_id_idx
on public.marketing_deliveries (integration_id);
