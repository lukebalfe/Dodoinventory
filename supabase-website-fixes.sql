-- Run this once in the Supabase SQL editor to enable the new "Dismiss"
-- buttons on Stock Counts and Transfer Orders. Purchase Orders already has
-- this same dismissed_at column, and these two work exactly the same way:
-- dismissing sets a timestamp instead of deleting the row, so the record
-- stays in the database for history/audit purposes but drops out of the
-- pending/active list on the page.

alter table stock_counts add column if not exists dismissed_at timestamptz;
alter table transfer_orders add column if not exists dismissed_at timestamptz;
