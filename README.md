# Dodo Coffee Inventory

A lightweight inventory management web app for Dodo Coffee Co, built with plain HTML/CSS/JavaScript and [Supabase](https://supabase.com) (auth, Postgres, storage, and realtime).

## Features

- **Dashboard** — inventory value, low-stock, out-of-stock, and pending stock-count summaries
- **Items** — products with variants, composite items, photos, per-location stock, search, filtering, sorting, and CSV export
- **Vendors & Locations** — supplier contacts and per-location stock assignment
- **Stock Counts, Adjustments, Transfer Orders, Purchase Orders** — full stock workflow with an audit trail
- **Realtime sync** — open pages update automatically when data changes elsewhere
- **Installable** — PWA manifest and home-screen icons for phone/tablet use
- Role-aware UI: admin-only actions are hidden from regular team members

## Recent improvements

1. **Low-stock alerts** — `stockStatus()` now flags items at or below their reorder level. Low-stock badges appear in the items list, a "Low stock" card was added to the dashboard, and the items page has a stock-level filter (Low / Out of stock).
2. **XSS protection** — a shared `esc()` helper in `app.js` escapes user-entered data (item, vendor, category, and location names, descriptions, error messages) before it is inserted into `innerHTML` templates on the dashboard, items, item-detail, and vendors pages.
3. **CSV export** — an "Export CSV" button on the Items page downloads whatever is currently filtered/sorted, including stock status and per-item inventory value. Opens directly in Excel/Google Sheets.
4. **Sorting + debounced search** — the Items list can be sorted by name, stock (low→high or high→low), or inventory value, and search-as-you-type is debounced so it no longer re-renders on every keystroke.
5. **Session-expiry handling** — the auth gate now listens to `onAuthStateChange`, so if a session expires or the user signs out in another tab, the app returns to the login screen instead of silently failing. The Dashboard and Items pages also got the same PWA/home-screen meta tags the other pages already had.

## Project structure

```
index.html              Dashboard
items.html              Items list + add/edit modal + CSV export
item-detail.html        Single item view, per-location stock, composite assembly
vendors.html            Vendor directory
locations.html          Locations and per-location stock assignment
stock-counts.html       Stock count workflow
stock-adjustments.html  Manual adjustment audit log
transfer-orders.html    Transfer orders between locations
purchase-orders.html    Purchase orders + printable sheet
app.js                  Shared helpers: Supabase client, auth gate, esc(), stockStatus(), realtime subscriptions
styles.css              Shared styles
manifest.json           PWA manifest
```

## Running locally

The app is fully static — serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Configuration

The Supabase project URL and anon (public) key live at the top of `app.js`. The anon key is safe to ship to the browser **only if Row Level Security (RLS) is enabled on every table** — make sure RLS policies restrict reads/writes to authenticated users, and admin-only writes to members of the `admins` table. The `.admin-only` UI hiding is cosmetic; RLS is what actually enforces permissions.
