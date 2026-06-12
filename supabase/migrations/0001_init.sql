-- TRZ Payroll Manager v2 — initial schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
create table if not exists businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  constraint businesses_name_unique unique (name)
);

-- ---------------------------------------------------------------------------
-- employees (soft delete via status = 'archived'; never hard-deleted)
-- ---------------------------------------------------------------------------
create table if not exists employees (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references businesses(id) on delete cascade,
  full_name          text not null,
  department         text,
  position           text,
  pay_type           text not null check (pay_type in ('fixed', 'daily', 'per_unit')),
  rate               numeric(12,2) not null check (rate >= 0),
  employment_status  text not null default 'Regular',
  benefits           text,
  notes              text,
  status             text not null default 'active' check (status in ('active', 'archived')),
  created_at         timestamptz not null default now(),
  -- prevent duplicate employees within a business
  constraint employees_name_unique unique (business_id, full_name)
);

create index if not exists idx_employees_business on employees (business_id);
create index if not exists idx_employees_status on employees (status);

-- ---------------------------------------------------------------------------
-- cash_advances (assigned to a payroll cutoff for auto-deduction)
-- ---------------------------------------------------------------------------
create table if not exists cash_advances (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  date         date not null,
  amount       numeric(12,2) not null check (amount > 0),
  reason       text,
  year         int not null check (year between 2000 and 2100),
  month        int not null check (month between 1 and 12),
  cutoff       int not null check (cutoff in (1, 2)),
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_ca_employee on cash_advances (employee_id);
create index if not exists idx_ca_cutoff on cash_advances (year, month, cutoff);

-- ---------------------------------------------------------------------------
-- payroll_periods (one row per year+month+cutoff; duplicate generation is
-- impossible — generation upserts on this key)
-- ---------------------------------------------------------------------------
create table if not exists payroll_periods (
  id           uuid primary key default gen_random_uuid(),
  year         int not null check (year between 2000 and 2100),
  month        int not null check (month between 1 and 12),
  cutoff       int not null check (cutoff in (1, 2)),
  created_at   timestamptz not null default now(),
  constraint payroll_periods_unique unique (year, month, cutoff)
);

-- ---------------------------------------------------------------------------
-- payroll_entries (computed values are SNAPSHOTS taken at generation time;
-- editing an employee's rate later never changes existing entries)
-- ---------------------------------------------------------------------------
create table if not exists payroll_entries (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid not null references payroll_periods(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete restrict,
  business_id      uuid not null references businesses(id) on delete restrict,
  pay_type         text not null check (pay_type in ('fixed', 'daily', 'per_unit')),
  rate             numeric(12,2) not null,
  units            numeric(8,2) not null default 0,
  gross            numeric(12,2) not null default 0,
  ca_deduction     numeric(12,2) not null default 0,
  other_deduction  numeric(12,2) not null default 0,
  net              numeric(12,2) not null default 0,
  status           text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at          timestamptz,
  payment_method   text,
  created_at       timestamptz not null default now(),
  -- one entry per employee per cutoff — duplicates are impossible
  constraint payroll_entries_unique unique (period_id, employee_id),
  -- paid entries must carry payment info; unpaid must not
  constraint payroll_entries_paid_fields check (
    (status = 'paid' and paid_at is not null and payment_method is not null)
    or (status = 'unpaid' and paid_at is null and payment_method is null)
  )
);

create index if not exists idx_entries_period on payroll_entries (period_id);
create index if not exists idx_entries_employee on payroll_entries (employee_id);
create index if not exists idx_entries_status on payroll_entries (status);

-- ---------------------------------------------------------------------------
-- payroll_payments (audit trail of mark-paid actions; undo deletes the row)
-- ---------------------------------------------------------------------------
create table if not exists payroll_payments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references payroll_entries(id) on delete cascade,
  amount      numeric(12,2) not null,
  method      text not null,
  paid_at     timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_payments_entry on payroll_payments (entry_id);

-- ---------------------------------------------------------------------------
-- settings (key/value store for app preferences)
-- ---------------------------------------------------------------------------
create table if not exists settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Protection: employees with payroll history cannot be hard-deleted.
-- payroll_entries.employee_id is ON DELETE RESTRICT, and this trigger gives
-- a clear error message instructing to archive instead.
-- ---------------------------------------------------------------------------
create or replace function prevent_employee_delete_with_history()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from payroll_entries where employee_id = old.id) then
    raise exception 'Employee % has payroll history and cannot be deleted. Archive instead.', old.full_name;
  end if;
  return old;
end $$;

drop trigger if exists trg_employee_delete_guard on employees;
create trigger trg_employee_delete_guard
  before delete on employees
  for each row execute function prevent_employee_delete_with_history();

-- ---------------------------------------------------------------------------
-- Protection: paid payroll entries are immutable. Computed/payment fields can
-- only change while the entry is unpaid, or in the act of paying/unpaying.
-- ---------------------------------------------------------------------------
create or replace function prevent_paid_entry_mutation()
returns trigger language plpgsql as $$
begin
  if old.status = 'paid' and new.status = 'paid' then
    if new.gross is distinct from old.gross
       or new.net is distinct from old.net
       or new.units is distinct from old.units
       or new.rate is distinct from old.rate
       or new.ca_deduction is distinct from old.ca_deduction
       or new.other_deduction is distinct from old.other_deduction then
      raise exception 'Paid payroll entries cannot be modified. Undo the payment first.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_paid_entry_guard on payroll_entries;
create trigger trg_paid_entry_guard
  before update on payroll_entries
  for each row execute function prevent_paid_entry_mutation();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Single-owner app: the anon key gets full access. RLS is still enabled on
-- every table so adding auth later only means swapping these policies for
-- `to authenticated using (auth.uid() = ...)` versions — no schema changes.
-- ---------------------------------------------------------------------------
alter table businesses enable row level security;
alter table employees enable row level security;
alter table cash_advances enable row level security;
alter table payroll_periods enable row level security;
alter table payroll_entries enable row level security;
alter table payroll_payments enable row level security;
alter table settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['businesses','employees','cash_advances','payroll_periods','payroll_entries','payroll_payments','settings']
  loop
    execute format('drop policy if exists "owner_all_%s" on %I', t, t);
    execute format('create policy "owner_all_%s" on %I for all using (true) with check (true)', t, t);
  end loop;
end $$;
