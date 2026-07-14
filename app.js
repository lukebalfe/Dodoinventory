// ---- Connect to Supabase ----
const SUPABASE_URL = 'https://kzoiuhaiqscaqiezzqmu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6b2l1aGFpcXNjYXFpZXp6cW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjcyMzUsImV4cCI6MjA5ODUwMzIzNX0.IcI9jcedtmCOU_5YNnmACRzZm00IHPqhCiV_GzIOBg8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isAdmin = false;

// ---- Shared helpers ----

function money(v) {
  if (v === null || v === undefined) return '—';
  return '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formats a plain count/quantity with thousands separators (1,240 not 1240).
function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString();
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
function subscribeToTable(table, callback) {
  const channelName = table + '-changes-' + Math.random().toString(36).slice(2);
  return supabaseClient
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
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
  // Set dodo-bird-only.png as the favicon on every page automatically
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.type = 'image/png';
  favicon.href = 'assets/dodo-bird-only.png';

  // Also cover apple-touch-icon so the home screen icon matches
  let touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!touchIcon) {
    touchIcon = document.createElement('link');
    touchIcon.rel = 'apple-touch-icon';
    document.head.appendChild(touchIcon);
  }
  touchIcon.href = 'assets/dodo-bird-only.png';

  // Swap every nav logo to dodo-bird-only.png
  document.querySelectorAll('.nav-logo').forEach(logo => {
    logo.src = 'assets/dodo-bird-only.png';
    logo.alt = 'Dodo Coffee';
  });

  // Also inject the Fulfillment nav link on every page without duplicating markup
  const navLinksForFulfillment = document.querySelector('.nav-links');
  if (navLinksForFulfillment && !navLinksForFulfillment.querySelector('a[href="fulfillments.html"]')) {
    const link = document.createElement('a');
    link.href = 'fulfillments.html';
    link.textContent = 'Fulfillment';
    const current = location.pathname.split('/').pop() || 'index.html';
    if (current === 'fulfillments.html') link.classList.add('active');
    navLinksForFulfillment.appendChild(link);
  }

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
