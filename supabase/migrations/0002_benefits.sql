-- TRZ Payroll Manager v2 — government benefits (SSS / PhilHealth / Pag-IBIG)
-- Run after 0001_init.sql.

-- ---------------------------------------------------------------------------
-- employees: free-text benefits -> checkbox flags
-- ---------------------------------------------------------------------------
alter table employees
  add column if not exists sss_enabled boolean not null default false,
  add column if not exists philhealth_enabled boolean not null default false,
  add column if not exists pagibig_enabled boolean not null default false;

-- Migrate legacy free-text values, then drop the old column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'employees' and column_name = 'benefits'
  ) then
    update employees set
      sss_enabled        = sss_enabled        or (benefits ilike '%sss%'),
      philhealth_enabled = philhealth_enabled or (benefits ilike '%philhealth%'),
      pagibig_enabled    = pagibig_enabled    or (benefits ilike '%pag%ibig%')
    where benefits is not null;
    alter table employees drop column benefits;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- payroll_entries: per-cutoff benefit SNAPSHOTS (frozen at generation time)
-- ---------------------------------------------------------------------------
alter table payroll_entries
  add column if not exists sss_employee                 numeric(12,2) not null default 0,
  add column if not exists philhealth_employee          numeric(12,2) not null default 0,
  add column if not exists pagibig_employee             numeric(12,2) not null default 0,
  add column if not exists sss_employer                 numeric(12,2) not null default 0,
  add column if not exists philhealth_employer          numeric(12,2) not null default 0,
  add column if not exists pagibig_employer             numeric(12,2) not null default 0,
  add column if not exists total_employee_benefits      numeric(12,2) not null default 0,
  add column if not exists total_employer_contributions numeric(12,2) not null default 0,
  add column if not exists company_cost                 numeric(12,2) not null default 0;

-- Backfill company_cost for pre-existing entries (no benefits yet => gross).
update payroll_entries set company_cost = gross where company_cost = 0;

-- ---------------------------------------------------------------------------
-- settings: default MONTHLY contribution amounts (editable in the app;
-- deducted in full on the 2nd cutoff of each month, none on the 1st)
-- ---------------------------------------------------------------------------
insert into settings (key, value) values (
  'benefit_rates',
  '{"sss_employee":250,"sss_employer":510,"philhealth_employee":0,"philhealth_employer":0,"pagibig_employee":100,"pagibig_employer":100}'::jsonb
) on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Extend the paid-entry guard: benefit snapshots are also immutable once paid.
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
       or new.other_deduction is distinct from old.other_deduction
       or new.sss_employee is distinct from old.sss_employee
       or new.philhealth_employee is distinct from old.philhealth_employee
       or new.pagibig_employee is distinct from old.pagibig_employee
       or new.sss_employer is distinct from old.sss_employer
       or new.philhealth_employer is distinct from old.philhealth_employer
       or new.pagibig_employer is distinct from old.pagibig_employer
       or new.total_employee_benefits is distinct from old.total_employee_benefits
       or new.total_employer_contributions is distinct from old.total_employer_contributions
       or new.company_cost is distinct from old.company_cost then
      raise exception 'Paid payroll entries cannot be modified. Undo the payment first.';
    end if;
  end if;
  return new;
end $$;
