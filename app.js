// ---- Connect to Supabase ----
const SUPABASE_URL = 'https://kzoiuhaiqscaqiezzqmu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6b2l1aGFpcXNjYXFpZXp6cW11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjcyMzUsImV4cCI6MjA5ODUwMzIzNX0.IcI9jcedtmCOU_5YNnmACRzZm00IHPqhCiV_GzIOBg8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isAdmin = false;

// ---- Shared helpers ----

function money(v) {
  if (v === null || v === undefined) return '—';
  return '$' + Number(v).toFixed(2);
}

function stockStatus(item) {
  const stock = Number(item.stock_on_hand ?? 0);
  const reorder = Number(item.reorder_level ?? 0);
  if (stock <= 0) return 'out';
  if (reorder > 0 && stock <= reorder) return 'low';
  return 'good';
}

function stockLabel(status) {
  return { good: 'In stock', low: 'Low stock', out: 'Out of stock' }[status];
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

// ---- Nav active-link highlighting ----
document.addEventListener('DOMContentLoaded', () => {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === current) a.classList.add('active');
  });
});
