// ---- Connect to Supabase ----
const SUPABASE_URL = 'https://kzoiuhaiqscaqiezzqmu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6b2l1aGFpcXNjYXFpZXp6cW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjcyMzUsImV4cCI6MjA5ODUwMzIzNX0.IcI9jcedtmCOU_5YNnmACRzZm00IHPqhCiV_GzIOBg8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isAdmin = false;

// ---- Shared helpers ----

// Escapes HTML special characters before inserting user data into innerHTML.
// Always call esc() on any string that came from the database.
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formats currency with thousands separators: $1,240.00
function money(v) {
  if (v === null || v === undefined) return '—';
  return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formats a plain number with thousands separators: 1,240
function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString();
}

// Displays stock alongside the item's unit of measure: "12 Bags"
function unitLabel(item, amount) {
  const unit = item?.unit_of_measure || 'PCS';
  return amount === null || amount === undefined ? `— ${unit}` : `${fmtNum(amount)} ${unit}`;
}

// Rewrites a Supabase storage URL to request a resized copy instead of
// the full original. Dramatically reduces image download sizes on the
// Items page (54px thumbnails) and item detail page.
function imgUrl(url, width, quality) {
  if (!url) return '';
  if (!url.includes('/storage/v1/object/')) return url;
  const transformed = url.replace('/storage/v1/object/', '/storage/v1/render/image/');
  const q = quality || 75;
  const sep = transformed.includes('?') ? '&' : '?';
  return `${transformed}${sep}width=${width}&quality=${q}&resize=contain`;
}

function stockStatus(item) {
  const stock = Number(item.stock_on_hand ?? 0);
  return stock <= 0 ? 'out' : 'good';
}

function stockLabel(status) {
  return status === 'out' ? 'Out of stock' : '';
}

function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function variantLabel(item) {
  const parts = [];
  if (item.attribute1_value) parts.push(item.attribute1_value);
  if (item.attribute2_value) parts.push(item.attribute2_value);
  if (item.attribute3_value) parts.push(item.attribute3_value);
  return parts.length ? parts.join(' / ') : item.variant_name;
}

async function getOrCreateByName(table, name) {
  if (!name) return null;
  const { data: existing } = await supabaseClient.from(table).select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  const { data: inserted, error } = await supabaseClient.from(table).insert({ name }).select('id').single();
  if (error) throw error;
  return inserted.id;
}

// ---- Live updates ----
// Subscribes to changes on a table and runs `callback` whenever a row
// changes, so open pages stay in sync without needing a manual refresh.
//
// Debounced: a single edit can still generate multiple postgres_changes
// events (e.g. your own save arriving back from the server), and several
// quick edits in a row would otherwise fire the callback once per edit.
// Collapsing bursts into one call avoids redundant refetches and the
// repeated-reload "flashing" that comes with them.
function subscribeToTable(table, callback, debounceMs = 350) {
  const channelName = table + '-changes-' + Math.random().toString(36).slice(2);
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), debounceMs);
  };
  return supabaseClient
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table }, debounced)
    .subscribe();
}

// ---- Replenishments ----
// Whenever a replenishment gets detached from an order — because the order
// was dismissed, voided by a fresh stock count, or otherwise cancelled —
// it needs to be re-evaluated against the item's *current* stock rather
// than just left pointing at a cancelled order with whatever numbers were
// true when it was created. This is shared by Purchase Orders, Transfer
// Orders, and Stock Counts so all three release replenishments the same
// way instead of three separate (and easily inconsistent) copies of the
// same logic.
//
// If the item now has enough stock, the replenishment is deleted — it no
// longer applies. Otherwise it's recalculated from the current numbers and
// reset to 'pending' so it can be picked up into a new order.
async function recalculateReplenishments(replenishmentIds) {
  const ids = [...new Set((replenishmentIds || []).filter(Boolean))];
  if (ids.length === 0) return;

  const { data: reps } = await supabaseClient
    .from('replenishments')
    .select('id, item_id, location_id')
    .in('id', ids);
  if (!reps || reps.length === 0) return;

  const locationIds = [...new Set(reps.map(r => r.location_id))];
  const itemIds = [...new Set(reps.map(r => r.item_id))];
  const { data: locRows } = await supabaseClient
    .from('item_locations')
    .select('item_id, location_id, stock_on_hand, reorder_level, max_stock, source_location_id, vendor_id')
    .in('location_id', locationIds)
    .in('item_id', itemIds);

  const locByKey = {};
  (locRows || []).forEach(r => { locByKey[`${r.item_id}:${r.location_id}`] = r; });

  for (const rep of reps) {
    const loc = locByKey[`${rep.item_id}:${rep.location_id}`];
    if (!loc) continue;

    const stillNeeded = loc.reorder_level !== null && loc.reorder_level !== undefined
      && Number(loc.stock_on_hand) <= Number(loc.reorder_level);

    if (!stillNeeded) {
      await supabaseClient.from('replenishments').delete().eq('id', rep.id);
      continue;
    }

    const amount = loc.max_stock !== null && loc.max_stock !== undefined
      ? Math.max(Number(loc.max_stock) - Number(loc.stock_on_hand), 0)
      : null;

    await supabaseClient.from('replenishments').update({
      current_stock: loc.stock_on_hand,
      reorder_level: loc.reorder_level,
      max_stock: loc.max_stock,
      source_location_id: loc.source_location_id,
      vendor_id: loc.vendor_id,
      replenishment_amount: amount,
      status: 'pending',
      order_table: null,
      order_id: null
    }).eq('id', rep.id);
  }
}

// ---- Auth gate (runs on every page) ----
// Each page must have: #login-screen, #app, #login-form, #login-email,
// #login-password, #login-error, #signout-btn, and a function onAppReady()
// that the page defines to render its own content once auth passes.

function initAuthGate(onAppReady) {
  const loginScreen = document.getElementById('login-screen');
  const appEl = document.getElementById('app');

  async function checkAdmin() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { isAdmin = false; return; }
    const { data } = await supabaseClient
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    isAdmin = !!data;
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = isAdmin ? '' : 'none';
    });
  }

  function showApp() {
    loginScreen.style.display = 'none';
    appEl.style.display = '';
    checkAdmin().then(onAppReady);
  }

  function showLogin() {
    loginScreen.style.display = 'flex';
    appEl.style.display = 'none';
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      return;
    }
    showApp();
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    showLogin();
  });

  supabaseClient.auth.getSession().then(({ data }) => {
    if (data.session) showApp();
    else showLogin();
  });
}

// ---- Nav active-link highlighting + mobile collapsible menu ----
document.addEventListener('DOMContentLoaded', () => {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === current) a.classList.add('active');
  });

  const nav = document.querySelector('.topnav');
  const navLinks = document.querySelector('.nav-links');
  if (!nav || !navLinks) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'nav-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Toggle navigation menu');
  toggleBtn.innerHTML = '☰';
  toggleBtn.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    toggleBtn.innerHTML = navLinks.classList.contains('open') ? '✕' : '☰';
  });

  nav.insertBefore(toggleBtn, navLinks);

  // Collapse the menu again once a link is tapped
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      navLinks.classList.remove('open');
      toggleBtn.innerHTML = '☰';
    });
  });
});
