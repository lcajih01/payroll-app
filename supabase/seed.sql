-- TRZ Payroll Manager v2 — demo seed data
-- Mirrors src/lib/seedData.js (used by Settings -> Reset Demo Data).
-- Run after ALL migrations (0001_init.sql, 0002_benefits.sql).
-- Idempotent: skips if businesses already exist.

do $$
declare
  hsh uuid;
  trz uuid;
begin
  if exists (select 1 from businesses) then
    raise notice 'Businesses already exist — seed skipped.';
    return;
  end if;

  insert into businesses (name) values ('Home Stay Hotel') returning id into hsh;
  insert into businesses (name) values ('The Resthouse Zamboanga') returning id into trz;

  -- Regular employees get SSS + PhilHealth + Pag-IBIG; probationary/contractual none.
  insert into employees (business_id, full_name, department, position, pay_type, rate, employment_status, status, notes, sss_enabled, philhealth_enabled, pagibig_enabled) values
    (hsh, 'Lei Renales',        'Front Office', 'Receptionist',        'fixed',    13000, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Angel Gabule',       'Housekeeping', 'Room Attendant',      'daily',      450, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Aldrick Dela Cruz',  'Maintenance',  'Handy Man',           'fixed',    12000, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Ino Neri',           'Front Office', 'Receptionist',        'fixed',    12500, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Romeo Suabig',       'Maintenance',  'Maintenance Staff',   'daily',      500, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Mary Grace Lim',     'Housekeeping', 'Room Attendant',      'daily',      450, 'Probationary', 'active',   null, false, false, false),
    (hsh, 'Jonas Bernardo',     'Security',     'Security Guard',      'fixed',    11000, 'Regular',      'active',   null, true, true, true),
    (hsh, 'Carla Mendoza',      'Front Office', 'Night Receptionist',  'fixed',    12000, 'Regular',      'archived', null, true, true, true),
    (trz, 'Arnel Ramos',        'Security',     'Security',            'per_unit',   300, 'Regular',      'active',   'Paid per occupied day', true, true, true),
    (trz, 'Grace Chiong',       'Housekeeping', 'Room Attendant',      'per_unit',   250, 'Regular',      'active',   'Paid per occupied day / booking', true, true, true),
    (trz, 'Dario Atilano',      'Grounds',      'Caretaker',           'fixed',    10000, 'Regular',      'active',   null, true, true, true),
    (trz, 'Jessa Marie Torres', 'Housekeeping', 'Room Attendant',      'per_unit',   250, 'Regular',      'active',   null, true, true, true),
    (trz, 'Ramil Bucoy',        'Maintenance',  'Handy Man',           'daily',      480, 'Regular',      'active',   null, true, true, true),
    (trz, 'Nina Alvarez',       'Front Office', 'Booking Coordinator', 'fixed',    11500, 'Regular',      'active',   null, true, true, true),
    (trz, 'Peter Sebastian',    'Grounds',      'Gardener',            'daily',      420, 'Contractual',  'archived', null, false, false, false);

  insert into cash_advances (employee_id, date, amount, reason, year, month, cutoff)
  select e.id, v.d::date, v.amt, v.rsn, 2026, 6, v.co
  from (values
    ('Lei Renales',       '2026-06-03', 5000::numeric, 'Personal',  1),
    ('Aldrick Dela Cruz', '2026-06-05', 3000::numeric, 'Personal',  1),
    ('Ino Neri',          '2026-06-06', 1200::numeric, 'Medical',   1),
    ('Romeo Suabig',      '2026-06-08', 1000::numeric, 'Personal',  1),
    ('Angel Gabule',      '2026-06-09', 1500::numeric, 'Emergency', 1),
    ('Grace Chiong',      '2026-06-10',  800::numeric, 'Personal',  2)
  ) as v(name, d, amt, rsn, co)
  join employees e on e.full_name = v.name;
end $$;
