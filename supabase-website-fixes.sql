-- Run after supabase-made-to-order.sql.
-- Adds units and the secure staging tables used by a Shopify webhook/integration.

alter table public.items add column if not exists unit_of_measure text not null default 'PCS';
alter table public.purchase_orders add column if not exists dismissed_at timestamptz;
alter table public.items drop constraint if exists items_unit_of_measure_check;
alter table public.items add constraint items_unit_of_measure_check
  check (unit_of_measure in ('Bottles','Bags','Lbs','PCS','Boxes'));

alter table public.fulfillments add column if not exists source text not null default 'manual';
alter table public.fulfillments add column if not exists external_order_id text;
create unique index if not exists fulfillments_source_external_order_idx
  on public.fulfillments(source, external_order_id) where external_order_id is not null;

create table if not exists public.shopify_orders (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id text not null unique,
  order_number text not null,
  customer_name text,
  status text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  raw_order jsonb,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  fulfillment_id uuid references public.fulfillments(id)
);

create table if not exists public.shopify_order_lines (
  id uuid primary key default gen_random_uuid(),
  shopify_order_id uuid not null references public.shopify_orders(id) on delete cascade,
  shopify_line_id text,
  sku text not null,
  title text,
  quantity numeric not null check (quantity > 0),
  item_id uuid references public.items(id)
);

create index if not exists shopify_orders_pending_idx on public.shopify_orders(status, created_at);
create index if not exists shopify_order_lines_order_idx on public.shopify_order_lines(shopify_order_id);
alter table public.shopify_orders enable row level security;
alter table public.shopify_order_lines enable row level security;

do $$ begin
  create policy "authenticated read shopify orders" on public.shopify_orders for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated update shopify orders" on public.shopify_orders for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "authenticated read shopify lines" on public.shopify_order_lines for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Shopify should write to these tables through a server-side webhook or Supabase
-- Edge Function using the service role. Never place a Shopify Admin token in app.js.
