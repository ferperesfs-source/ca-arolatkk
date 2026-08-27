create table if not exists public.checkout_addons (
  id text primary key check (id ~ '^[a-z0-9_-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 160),
  old_price numeric(10,2) check (old_price is null or old_price >= 0),
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checkout_shipping_methods (
  id text primary key check (id ~ '^[a-z0-9_-]{1,80}$'),
  title text not null check (char_length(title) between 1 and 100),
  description text not null check (char_length(description) between 1 and 160),
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.checkout_addons (id,title,old_price,price,image_url,active,sort_order) values
  ('jantar','Jogo de Jantar 10 Peças Oxford Ryo Maresia',189.90,46.20,'/assets/checkout/order-bump-jantar.png',true,10),
  ('potes','Kit 10 Potes de Vidro Herméticos Colinox',139.90,36.45,'/assets/checkout/order-bump-potes.png',true,20),
  ('panela','Panela de Pressão Colinox Antiaderente 4,2L',219.90,55.47,'/assets/checkout/order-bump-panela.png',true,30)
on conflict (id) do update set title=excluded.title,old_price=excluded.old_price,price=excluded.price,image_url=excluded.image_url,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();

insert into public.checkout_shipping_methods (id,title,description,price,image_url,active,sort_order) values
  ('free','Frete Grátis','Entrega em 10 a 12 dias',0,'/assets/checkout/shipping-free.jpg',true,10),
  ('jadlog','JADLOG','Entrega em até 5 dias úteis',18.47,'/assets/checkout/shipping-jadlog.jpg',true,20),
  ('sedex-12','SEDEX 12','Entrega de 12h a 24h',33.40,'/assets/checkout/shipping-sedex.png',true,30)
on conflict (id) do update set title=excluded.title,description=excluded.description,price=excluded.price,image_url=excluded.image_url,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();

alter table public.orders
  add column if not exists addons jsonb not null default '[]'::jsonb,
  add column if not exists shipping_method text not null default 'free',
  add column if not exists shipping_amount numeric(10,2) not null default 0;

alter table public.checkout_addons enable row level security;
alter table public.checkout_shipping_methods enable row level security;

create policy "active checkout addons are public" on public.checkout_addons for select to anon, authenticated using (active = true);
create policy "active shipping methods are public" on public.checkout_shipping_methods for select to anon, authenticated using (active = true);

revoke all on public.checkout_addons, public.checkout_shipping_methods from anon, authenticated;
grant select on public.checkout_addons, public.checkout_shipping_methods to anon, authenticated;

create or replace function public.prepare_cacarola_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  input_item jsonb;
  input_addon jsonb;
  catalog_item public.products%rowtype;
  catalog_addon public.checkout_addons%rowtype;
  delivery_method public.checkout_shipping_methods%rowtype;
  normalized_items jsonb := '[]'::jsonb;
  normalized_addons jsonb := '[]'::jsonb;
  seen_addons text[] := array[]::text[];
  addon_id text;
  item_quantity integer;
  calculated_total numeric(10,2) := 0;
  calculated_quantity integer := 0;
begin
  new.customer_email := lower(trim(new.customer_email));
  new.customer_name := trim(new.customer_name);
  new.phone := regexp_replace(new.phone, '[^0-9]', '', 'g');
  new.customer_tax_id := regexp_replace(new.customer_tax_id, '[^0-9]', '', 'g');

  for input_item in select value from jsonb_array_elements(new.items)
  loop
    item_quantity := coalesce((input_item ->> 'quantity')::integer, 0);
    if item_quantity < 1 or item_quantity > 99 then raise exception 'Quantidade inválida'; end if;
    select * into catalog_item from public.products where id = input_item ->> 'product_id' and active = true;
    if not found then raise exception 'Produto indisponível'; end if;
    if catalog_item.stock_quantity is not null and catalog_item.stock_quantity < item_quantity then raise exception 'Estoque insuficiente'; end if;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'product_id',catalog_item.id,'title',catalog_item.title,'variant_name',catalog_item.variant_name,
      'unit_price',catalog_item.price,'quantity',item_quantity
    ));
    calculated_quantity := calculated_quantity + item_quantity;
    calculated_total := calculated_total + catalog_item.price * item_quantity;
  end loop;

  if jsonb_typeof(coalesce(new.addons, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(new.addons, '[]'::jsonb)) > 3 then
    raise exception 'Ofertas adicionais inválidas';
  end if;
  for input_addon in select value from jsonb_array_elements(coalesce(new.addons, '[]'::jsonb))
  loop
    addon_id := input_addon ->> 'addon_id';
    if addon_id is null or addon_id = any(seen_addons) then raise exception 'Oferta adicional inválida'; end if;
    select * into catalog_addon from public.checkout_addons where id = addon_id and active = true;
    if not found then raise exception 'Oferta adicional indisponível'; end if;
    seen_addons := array_append(seen_addons, addon_id);
    normalized_addons := normalized_addons || jsonb_build_array(jsonb_build_object(
      'addon_id',catalog_addon.id,'title',catalog_addon.title,'unit_price',catalog_addon.price,'quantity',1
    ));
    calculated_quantity := calculated_quantity + 1;
    calculated_total := calculated_total + catalog_addon.price;
  end loop;

  select * into delivery_method from public.checkout_shipping_methods where id = new.shipping_method and active = true;
  if not found then raise exception 'Forma de entrega indisponível'; end if;

  new.items := normalized_items;
  new.addons := normalized_addons;
  new.shipping_amount := delivery_method.price;
  new.quantity := calculated_quantity;
  new.amount := calculated_total + delivery_method.price;
  new.currency := 'BRL';
  new.status := 'pending';
  new.updated_at := now();
  return new;
end;
$$;
