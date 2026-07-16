// ============================================================
// Supabase Edge Function: send-stock-digest
//
// Runs once a day (triggered by pg_cron — see the SQL file).
// Checks for:
//   1. Items at or below their reorder level at any location
//   2. Pending replenishments (transfer or purchase orders waiting)
//   3. Pending stock counts that are overdue
//
// Sends a single digest email via Resend if anything needs attention.
// If everything is fine, no email is sent.
//
// Environment variables required (set in Supabase Dashboard →
// Edge Functions → send-stock-digest → Secrets):
//   RESEND_API_KEY  — your Resend API key (starts with re_)
//   DIGEST_TO       — email address to send the digest to
//   DIGEST_FROM     — sender address (e.g. inventory@yourdomain.com)
//                     OR onboarding@resend.dev for testing
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  // ---- Connect to Supabase using the service role so we can read all tables
  // (the anon key only works for authenticated sessions — the cron job doesn't
  // have a user session, so we use the service role key instead)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const resendKey  = Deno.env.get('RESEND_API_KEY');
  const digestTo   = Deno.env.get('DIGEST_TO');
  const digestFrom = Deno.env.get('DIGEST_FROM') || 'Dodo Coffee Inventory <onboarding@resend.dev>';

  if (!resendKey || !digestTo) {
    console.error('Missing RESEND_API_KEY or DIGEST_TO environment variables');
    return new Response('Missing env vars', { status: 500 });
  }

  // ---- 1. Items at or below their reorder level at any location ----
  // Joins item_locations → items → products → locations so we can display
  // a human-readable name and location for each low-stock item.
  const { data: lowStockRows, error: lowStockErr } = await supabase
    .from('item_locations')
    .select(`
      stock_on_hand,
      reorder_level,
      locations ( name ),
      items (
        sku,
        variant_name,
        attribute1_value,
        products ( name )
      )
    `)
    .not('reorder_level', 'is', null)
    .gt('reorder_level', 0)
    .filter('stock_on_hand', 'lte', 'reorder_level'); // stock ≤ reorder point

  if (lowStockErr) console.error('low stock query:', lowStockErr.message);

  // ---- 2. Pending replenishments not yet turned into orders ----
  const { data: pendingReplen, error: replenErr } = await supabase
    .from('replenishments')
    .select(`
      replenishment_type,
      current_stock,
      replenishment_amount,
      items ( sku, attribute1_value, variant_name, products ( name ) ),
      destination:location_id ( name )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (replenErr) console.error('replenishment query:', replenErr.message);

  // ---- 3. Overdue pending stock counts ----
  // A count is "overdue" if it has a due_date in the past and is still pending.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data: overdueCounts, error: countsErr } = await supabase
    .from('stock_counts')
    .select(`due_date, locations ( name )`)
    .eq('status', 'pending')
    .not('due_date', 'is', null)
    .lt('due_date', today);

  if (countsErr) console.error('stock counts query:', countsErr.message);

  // ---- If nothing needs attention, don't send anything ----
  const lowStock = lowStockRows || [];
  const replen   = pendingReplen || [];
  const overdue  = overdueCounts || [];

  if (lowStock.length === 0 && replen.length === 0 && overdue.length === 0) {
    console.log('Nothing to report — skipping digest email');
    return new Response('Nothing to report', { status: 200 });
  }

  // ---- Build the email HTML ----
  // Each section only appears if there's something to show in it.

  const itemLabel = (item: any) => {
    const base = item?.products?.name || 'Unknown item';
    const variant = item?.attribute1_value || item?.variant_name;
    return variant && variant !== base ? `${base} — ${variant}` : base;
  };

  const lowStockSection = lowStock.length === 0 ? '' : `
    <h2 style="color:#8f3229; font-size:16px; margin:24px 0 8px;">
      ⚠️ ${lowStock.length} item${lowStock.length === 1 ? '' : 's'} at or below reorder level
    </h2>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:#f5f0e8; text-align:left;">
          <th style="padding:8px 10px; border-bottom:1px solid #ddd;">Item</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd;">Location</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd; text-align:right;">Stock</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd; text-align:right;">Reorder level</th>
        </tr>
      </thead>
      <tbody>
        ${lowStock.map((row: any, i: number) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#faf9f6'}">
            <td style="padding:8px 10px; border-bottom:1px solid #eee;">${itemLabel(row.items)}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee;">${row.locations?.name || '—'}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; text-align:right; color:#8f3229; font-weight:bold;">${row.stock_on_hand ?? 0}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; text-align:right;">${row.reorder_level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const replenSection = replen.length === 0 ? '' : `
    <h2 style="color:#a8761f; font-size:16px; margin:24px 0 8px;">
      📦 ${replen.length} pending replenishment${replen.length === 1 ? '' : 's'} waiting for orders
    </h2>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:#f5f0e8; text-align:left;">
          <th style="padding:8px 10px; border-bottom:1px solid #ddd;">Item</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd;">To location</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd;">Type</th>
          <th style="padding:8px 10px; border-bottom:1px solid #ddd; text-align:right;">Order qty</th>
        </tr>
      </thead>
      <tbody>
        ${replen.map((row: any, i: number) => `
          <tr style="background:${i % 2 === 0 ? '#fff' : '#faf9f6'}">
            <td style="padding:8px 10px; border-bottom:1px solid #eee;">${itemLabel(row.items)}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee;">${row.destination?.name || '—'}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; text-transform:capitalize;">${row.replenishment_type || '—'}</td>
            <td style="padding:8px 10px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">${row.replenishment_amount ?? 0}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const overdueSection = overdue.length === 0 ? '' : `
    <h2 style="color:#5c4d3d; font-size:16px; margin:24px 0 8px;">
      📋 ${overdue.length} overdue stock count${overdue.length === 1 ? '' : 's'}
    </h2>
    <ul style="font-size:13px; margin:0; padding-left:20px;">
      ${overdue.map((row: any) => `
        <li style="margin-bottom:6px;">
          <strong>${row.locations?.name || 'Unknown location'}</strong>
          — was due ${row.due_date}
        </li>
      `).join('')}
    </ul>
  `;

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 color: #1a1512; max-width: 640px; margin: 0 auto; padding: 24px;">

      <div style="border-bottom: 3px solid #4b3621; padding-bottom: 14px; margin-bottom: 20px;">
        <h1 style="font-size: 20px; margin: 0; color: #4b3621;">Dodo Coffee — Daily Inventory Digest</h1>
        <p style="font-size: 13px; color: #8f8168; margin: 4px 0 0;">${dateStr}</p>
      </div>

      ${lowStockSection}
      ${replenSection}
      ${overdueSection}

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd;
                  font-size: 12px; color: #8f8168; text-align: center;">
        Sent by Dodo Coffee Inventory &nbsp;·&nbsp;
        <a href="https://lukebalfe.github.io/Dodoinventory/" style="color: #4b3621;">Open inventory</a>
      </div>
    </body>
    </html>
  `;

  // ---- Send via Resend ----
  const subject = [
    lowStock.length  > 0 && `${lowStock.length} low stock`,
    replen.length    > 0 && `${replen.length} pending replenishment${replen.length === 1 ? '' : 's'}`,
    overdue.length   > 0 && `${overdue.length} overdue count${overdue.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: digestFrom,
      to: [digestTo],
      subject: `Dodo Inventory: ${subject}`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Resend error:', body);
    return new Response('Email send failed: ' + body, { status: 500 });
  }

  console.log(`Digest sent to ${digestTo}: ${subject}`);
  return new Response('Digest sent', { status: 200 });
});
