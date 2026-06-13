# TRZ Payroll Manager v2

Mobile-first payroll PWA for **Home Stay Hotel** and **The Resthouse Zamboanga**.
Built with React + Vite + Tailwind CSS v4 + Supabase. Owner-operated, 10–50 employees, payroll only — no accounting, no HRIS.

## Features

- **Dashboard** — per-cutoff Gross / Net / Paid / Remaining Payable / Cash Advances / Benefits / Company Cost / Active Employees, recent payroll status
- **Employees** — add, edit, archive (soft delete), search, business filter; Fixed Monthly, Daily, and Per Occupied Day / Booking pay types; SSS / PhilHealth / Pag-IBIG checkboxes per employee
- **Government Benefits** — monthly SSS / PhilHealth / Pag-IBIG amounts (employee + employer share) editable in Settings; deducted **in full on the 2nd cutoff** of each month (no benefit deductions on the 1st cutoff). Net Pay = Gross + Adjustment − Cash Advances − employee benefit shares; Company Cost = Gross + employer contributions. **Adjustment** is a single signed per-entry field (set in Edit Payroll Entry): positive adds pay, negative deducts.
- **Payroll** — generate per year/month/cutoff/business, edit day/booking counts, auto recompute, mark paid (method + date), undo paid, payslips with benefit breakdown and employer contributions
- **Cash Advances** — assigned to a payroll cutoff and auto-deducted from it
- **Reports** — payroll history, payslip view, printable payslips, CSV export
- **Settings** — business names, JSON backup/restore, reset demo data
- **PWA** — installable, offline app shell, auto-updating service worker

### Payroll integrity rules

- Payroll entries store **snapshots** (rate, gross, deductions, benefit amounts, net, company cost). **Paid entries are locked** — they never change unless explicitly reverted, enforced by a DB trigger.
- **Refresh Payroll** recalculates all **unpaid** entries from the current employee setup (rate, pay type, benefit checkboxes), current benefit rates, and current cash advances — keeping owner-entered day/booking counts and other deductions — and adds missing active employees. A per-row **Revert** does the same for one entry (with confirmation if it is paid: payment info is cleared first).
- Regenerating a cutoff **updates existing entries instead of duplicating** (`UNIQUE (period_id, employee_id)` + upsert).
- Changing/deleting a cash advance recomputes **unpaid** entries only; paid entries never silently change (also enforced by a DB trigger).
- Mark Paid saves status + method + date and writes a `payroll_payments` audit row; Undo Paid reverses all of it.
- **Remaining Payable counts only unpaid payroll.**
- Employees with payroll history cannot be hard-deleted (FK `RESTRICT` + trigger) — archive instead.

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run every file in `supabase/migrations/` in order (`0001_init.sql`, then `0002_benefits.sql`). Existing databases only need the migrations they haven't run yet — `0002` safely migrates old free-text benefits into the new checkboxes.
3. Optionally run `supabase/seed.sql` for demo data (or use **Settings → Reset Demo Data** in the app).

### 2. Environment

```sh
cp .env.example .env
```

Fill in (Supabase dashboard → Settings → API):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Use the **anon public key only — never the service role key.** If credentials are missing, the app shows a setup guide instead of crashing.

### 3. Run locally

```sh
npm install
npm run dev          # http://localhost:5173
```

Try it **without** a Supabase project (in-memory demo, resets on restart):

```sh
npm run mock              # mock API on http://localhost:54321
npm run dev -- --mode demo   # uses .env.demo, which points at the mock
```

### 4. Test & build

```sh
npm test             # payroll calculation tests (vitest)
npm run build        # production build -> dist/ (env vars are baked in at build time)
npm run preview      # serve the production build locally
```

## Deploy

Any static host works. The build outputs to `dist/`.

```sh
# Vercel
npm i -g vercel && vercel --prod

# Netlify
npm i -g netlify-cli && netlify deploy --prod --dir=dist
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host's environment settings (or have a correct `.env` present at build time). After deploying over HTTPS, open the site on a phone → "Add to Home Screen" to install the PWA.

## Project structure

```
supabase/
  migrations/0001_init.sql   schema, constraints, triggers, RLS
  seed.sql                   demo data (matches in-app Reset Demo Data)
scripts/
  make-icons.mjs             procedurally generates PWA icons (npm run icons)
  mock-supabase.mjs          in-memory PostgREST emulator (npm run mock)
src/
  lib/payroll.js             pure calculation engine (fully unit-tested)
  lib/supabase.js            client (anon key only) + configured check
  lib/seedData.js            demo dataset
  context/DataContext.jsx    data loading + all Supabase mutations
  components/                ui kit, period picker, payslip sheet
  pages/                     Dashboard, Employees, Payroll, CashAdvances, Reports, Settings, SetupGuide
  tests/payroll.test.js      21 tests: gross/net per pay type, CA deduction,
                             mark/undo paid, remaining payable, snapshots
```

## Database

| Table | Purpose | Key constraints |
|---|---|---|
| `businesses` | the two businesses | unique name |
| `employees` | roster (soft-archive) | unique (business, name); delete blocked if payroll history |
| `cash_advances` | advances tied to a cutoff | amount > 0 |
| `payroll_periods` | one row per year+month+cutoff | unique (year, month, cutoff) |
| `payroll_entries` | snapshotted computed pay | unique (period, employee); paid rows immutable via trigger |
| `payroll_payments` | mark-paid audit trail | cascade on entry |
| `settings` | key/value prefs | — |

RLS is enabled on every table with permissive policies for the anon key (single-owner app, no login). To add auth later, replace the policies — no schema changes needed.

## Known limitations

- **No authentication** — anyone with the URL and anon key can use the app. Keep the URL private, or add Supabase Auth + restrictive RLS policies if it will be exposed publicly.
- Single currency (PHP), semi-monthly cutoffs only (1–15, 16–end).
- Offline mode caches the app shell; data operations still need a connection (writes are not queued offline).
- CSV export covers one cutoff at a time.
- Backup/restore replaces all data wholesale; it is not a merge.
