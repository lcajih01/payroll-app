import { SEED_BUSINESSES, SEED_EMPLOYEES, SEED_CASH_ADVANCES } from './seedData'

// FK-safe deletion order: children before parents, settings last.
export const WIPE_ORDER = [
  ['payroll_payments', 'id'],
  ['payroll_entries', 'id'],
  ['payroll_periods', 'id'],
  ['cash_advances', 'id'],
  ['employees', 'id'],
  ['businesses', 'id'],
  ['settings', 'key'],
]

// Sentinel values no real row can have, so `neq` matches every row.
// Deleting by primary key works identically in Supabase/PostgREST and the
// local mock, and unlike a created_at filter it cannot skip rows.
const SENTINEL = {
  id: '00000000-0000-0000-0000-000000000000',
  key: '__sentinel_no_such_key__',
}

// Delete every row from every table, in dependency order.
export async function wipeAllData(client) {
  for (const [table, pk] of WIPE_ORDER) {
    const { error } = await client.from(table).delete().neq(pk, SENTINEL[pk])
    if (error) throw error
  }
}

// Insert demo businesses, employees and default cash advances only.
export async function seedDemoData(client) {
  const { data: biz, error: bErr } = await client.from('businesses').insert(SEED_BUSINESSES).select()
  if (bErr) throw bErr
  const bizByName = new Map(biz.map(b => [b.name, b.id]))

  const empRows = SEED_EMPLOYEES.map(({ business, ...e }) => ({ ...e, business_id: bizByName.get(business) }))
  const { data: emps, error: eErr } = await client.from('employees').insert(empRows).select()
  if (eErr) throw eErr
  const empByName = new Map(emps.map(e => [e.full_name, e.id]))

  const caRows = SEED_CASH_ADVANCES.map(({ employee, ...c }) => ({ ...c, employee_id: empByName.get(employee) }))
  const { error: cErr } = await client.from('cash_advances').insert(caRows)
  if (cErr) throw cErr
}

// Full reset: wipe everything, reseed the demo dataset.
export async function resetAllData(client) {
  await wipeAllData(client)
  await seedDemoData(client)
}
