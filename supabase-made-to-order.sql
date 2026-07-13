-- Run once in the Supabase SQL editor before publishing the updated site.
-- Adds made-to-order tracking and an atomic fulfillment/reversal ledger.

alter table public.items
  add column if not exists tracking_type text not null default 'stocked'
  check (tracking_type in ('stocked', 'made_to_order', 'non_inventory'));

create table if not exists public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  location_id uuid not null references public.locations(id),
  status text not null default 'fulfilled' check (status in ('fulfilled', 'reversed')),
  notes text,
  fulfilled_by uuid references auth.users(id),
  fulfilled_at timestamptz not null default now(),
  reversed_by uuid references auth.users(id),
  reversed_at timestamptz
);

create table if not exists public.fulfillment_lines (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,
  item_id uuid not null references public.items(id),
  quantity numeric not null check (quantity > 0)
);

create table if not exists public.fulfillment_component_movements (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete cascade,
  fulfillment_line_id uuid not null references public.fulfillment_lines(id) on delete cascade,
  component_item_id uuid not null references public.items(id),
  location_id uuid not null references public.locations(id),
  quantity numeric not null check (quantity > 0),
  previous_stock numeric not null,
  new_stock numeric not null
);

create index if not exists fulfillment_lines_fulfillment_idx on public.fulfillment_lines(fulfillment_id);
create index if not exists fulfillment_movements_fulfillment_idx on public.fulfillment_component_movements(fulfillment_id);

create or replace function public.fulfill_made_to_order(
  p_reference text, p_location_id uuid, p_lines jsonb, p_notes text default null
) returns uuid language plpgsql security invoker as $$
declare
  v_fulfillment_id uuid;
  v_line jsonb;
  v_line_id uuid;
  v_component record;
  v_qty numeric;
  v_available numeric;
begin
  if nullif(trim(p_reference), '') is null then raise exception 'A reference is required'; end if;
  if jsonb_array_length(p_lines) = 0 then raise exception 'At least one item is required'; end if;

  insert into public.fulfillments(reference, location_id, notes, fulfilled_by)
  values (trim(p_reference), p_location_id, nullif(trim(p_notes), ''), auth.uid()) returning id into v_fulfillment_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantities must be greater than zero'; end if;
    if not exists (select 1 from public.items where id=(v_line->>'item_id')::uuid and tracking_type='made_to_order') then
      raise exception 'Every fulfillment item must be made to order';
    end if;
    insert into public.fulfillment_lines(fulfillment_id,item_id,quantity)
    values(v_fulfillment_id,(v_line->>'item_id')::uuid,v_qty) returning id into v_line_id;

    if not exists (select 1 from public.composite_components where composite_item_id=(v_line->>'item_id')::uuid) then
      raise exception 'A made-to-order item has no components configured';
    end if;

    for v_component in
      select cc.component_item_id, cc.quantity_required * v_qty as required_qty
      from public.composite_components cc where cc.composite_item_id=(v_line->>'item_id')::uuid
    loop
      select stock_on_hand into v_available from public.item_locations
      where item_id=v_component.component_item_id and location_id=p_location_id for update;
      if v_available is null or v_available < v_component.required_qty then
        raise exception 'Insufficient component stock for item % (need %, have %)', v_component.component_item_id, v_component.required_qty, coalesce(v_available,0);
      end if;
      update public.item_locations set stock_on_hand=v_available-v_component.required_qty
      where item_id=v_component.component_item_id and location_id=p_location_id;
      update public.items set stock_on_hand=coalesce(stock_on_hand,0)-v_component.required_qty
      where id=v_component.component_item_id;
      insert into public.fulfillment_component_movements
        (fulfillment_id,fulfillment_line_id,component_item_id,location_id,quantity,previous_stock,new_stock)
      values(v_fulfillment_id,v_line_id,v_component.component_item_id,p_location_id,v_component.required_qty,v_available,v_available-v_component.required_qty);
      insert into public.stock_adjustments(item_id,location_id,previous_stock,new_stock,reason,changed_by)
      values(v_component.component_item_id,p_location_id,v_available,v_available-v_component.required_qty,'Fulfillment '||trim(p_reference),auth.uid());
    end loop;
  end loop;
  return v_fulfillment_id;
end $$;

create or replace function public.reverse_fulfillment(p_fulfillment_id uuid)
returns void language plpgsql security invoker as $$
declare v_f record; v_m record; v_current numeric;
begin
  select * into v_f from public.fulfillments where id=p_fulfillment_id for update;
  if not found then raise exception 'Fulfillment not found'; end if;
  if v_f.status='reversed' then raise exception 'Fulfillment is already reversed'; end if;
  for v_m in select * from public.fulfillment_component_movements where fulfillment_id=p_fulfillment_id loop
    select stock_on_hand into v_current from public.item_locations
    where item_id=v_m.component_item_id and location_id=v_m.location_id for update;
    update public.item_locations set stock_on_hand=coalesce(v_current,0)+v_m.quantity
    where item_id=v_m.component_item_id and location_id=v_m.location_id;
    update public.items set stock_on_hand=coalesce(stock_on_hand,0)+v_m.quantity where id=v_m.component_item_id;
    insert into public.stock_adjustments(item_id,location_id,previous_stock,new_stock,reason,changed_by)
    values(v_m.component_item_id,v_m.location_id,coalesce(v_current,0),coalesce(v_current,0)+v_m.quantity,'Reversed fulfillment '||v_f.reference,auth.uid());
  end loop;
  update public.fulfillments set status='reversed',reversed_by=auth.uid(),reversed_at=now() where id=p_fulfillment_id;
end $$;

alter table public.fulfillments enable row level security;
alter table public.fulfillment_lines enable row level security;
alter table public.fulfillment_component_movements enable row level security;

create policy "authenticated read fulfillments" on public.fulfillments for select to authenticated using (true);
create policy "authenticated write fulfillments" on public.fulfillments for all to authenticated using (true) with check (true);
create policy "authenticated read fulfillment lines" on public.fulfillment_lines for select to authenticated using (true);
create policy "authenticated write fulfillment lines" on public.fulfillment_lines for all to authenticated using (true) with check (true);
create policy "authenticated read movements" on public.fulfillment_component_movements for select to authenticated using (true);
create policy "authenticated write movements" on public.fulfillment_component_movements for all to authenticated using (true) with check (true);
