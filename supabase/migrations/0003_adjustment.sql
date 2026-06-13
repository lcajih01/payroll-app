-- TRZ Payroll Manager v2 — replace other_deduction with a signed adjustment.
-- Run after 0002_benefits.sql.
--
-- "Adjustment" is a single signed field applied to net pay:
--   Net Pay = Gross + Adjustment - Cash Advances - Employee Government Contributions
--   positive adds pay, negative deducts.

-- ---------------------------------------------------------------------------
-- payroll_entries: add the signed adjustment column.
-- ---------------------------------------------------------------------------
alter table payroll_entries
  add column if not exists adjustment numeric(12,2) not null default 0;

-- Migrate the old (always-positive, always-subtracted) other_deduction into a
-- negative adjustment. e.g. other_deduction 500 -> adjustment -500. Net is
-- unchanged: gross + (-500) - ca - ee == gross - 500 - ca - ee.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'payroll_entries' and column_name = 'other_deduction'
  ) then
    update payroll_entries set adjustment = -other_deduction where other_deduction <> 0;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Redefine the paid-entry guard to lock `adjustment` instead of
-- `other_deduction` (must run BEFORE dropping the old column).
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
       or new.adjustment is distinct from old.adjustment
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

-- ---------------------------------------------------------------------------
-- Drop the obsolete column.
-- ---------------------------------------------------------------------------
alter table payroll_entries drop column if exists other_deduction;
