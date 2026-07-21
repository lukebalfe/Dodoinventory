-- Run this once in the Supabase SQL editor to enable the new "Dismiss"
-- buttons on Stock Counts and Transfer Orders. Purchase Orders already has
-- this same dismissed_at column, and these two work exactly the same way:
-- dismissing sets a timestamp instead of deleting the row, so the record
-- stays in the database for history/audit purposes but drops out of the
-- pending/active list on the page.

alter table stock_counts add column if not exists dismissed_at timestamptz;
alter table transfer_orders add column if not exists dismissed_at timestamptz;

-- ------------------------------------------------------------------
-- One-time cleanup: fix replenishments already orphaned by dismissing
-- a transfer/purchase order BEFORE this fix existed. Those rows were
-- left pointing at a dismissed order with stale stock numbers frozen
-- from whenever the order was created (e.g. a stock count later showed
-- the real number was higher or lower, but nothing ever went back and
-- updated these) — this is very likely why some "current stock" numbers
-- looked wrong. Run this once; going forward the app keeps these in sync
-- itself (see recalculateReplenishments in app.js).
-- ------------------------------------------------------------------

-- Step 1: delete orphaned replenishments whose item now has enough stock
-- that it doesn't need replenishing anymore.
delete from replenishments r
using item_locations il
where r.item_id = il.item_id
  and r.location_id = il.location_id
  and r.status = 'ordered'
  and (
    (r.order_table = 'transfer_orders' and exists (
      select 1 from transfer_orders t where t.id = r.order_id and t.dismissed_at is not null))
    or
    (r.order_table = 'purchase_orders' and exists (
      select 1 from purchase_orders p where p.id = r.order_id and p.dismissed_at is not null))
  )
  and (il.reorder_level is null or il.stock_on_hand > il.reorder_level);

-- Step 2: for the rest, release them back to 'pending' and recalculate
-- their numbers from the item's actual current stock.
update replenishments r
set status = 'pending',
    order_table = null,
    order_id = null,
    current_stock = il.stock_on_hand,
    reorder_level = il.reorder_level,
    max_stock = il.max_stock,
    source_location_id = il.source_location_id,
    vendor_id = il.vendor_id,
    replenishment_amount = case when il.max_stock is not null
      then greatest(il.max_stock - il.stock_on_hand, 0) else null end
from item_locations il
where r.item_id = il.item_id
  and r.location_id = il.location_id
  and r.status = 'ordered'
  and (
    (r.order_table = 'transfer_orders' and exists (
      select 1 from transfer_orders t where t.id = r.order_id and t.dismissed_at is not null))
    or
    (r.order_table = 'purchase_orders' and exists (
      select 1 from purchase_orders p where p.id = r.order_id and p.dismissed_at is not null))
  );
