import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { createMockServer } from '../../scripts/mock-supabase.mjs'
import { wipeAllData, resetAllData, WIPE_ORDER } from '../lib/demoReset'
import { SEED_BUSINESSES, SEED_EMPLOYEES, SEED_CASH_ADVANCES } from '../lib/seedData'

// Integration test: runs the real supabase-js client against the in-memory
// PostgREST mock, exercising the exact queries production uses.
let server
let client

beforeAll(async () => {
  server = createMockServer()
  await new Promise(resolve => server.listen(0, resolve))
  client = createClient(`http://127.0.0.1:${server.address().port}`, 'test-anon-key')
})

afterAll(() => new Promise(resolve => server.close(resolve)))

const count = async (table) => {
  const { data, error } = await client.from(table).select('*')
  if (error) throw error
  return data.length
}

describe('reset demo data', () => {
  it('clears pre-existing cash advances and all payroll data, then reseeds defaults', async () => {
    // Simulate real usage on top of the demo data: an extra cash advance
    // plus a full payroll chain (period -> entry -> payment).
    const { data: emp } = await client.from('employees').select('*').limit(1).single()
    const { error: caErr } = await client.from('cash_advances').insert({
      employee_id: emp.id, date: '2026-06-11', amount: 7777,
      reason: 'EXTRA-NOT-SEED', year: 2026, month: 6, cutoff: 1,
    })
    expect(caErr).toBeNull()

    const { data: period } = await client.from('payroll_periods')
      .insert({ year: 2026, month: 6, cutoff: 1 }).select().single()
    const { data: entry } = await client.from('payroll_entries').insert({
      period_id: period.id, employee_id: emp.id, business_id: emp.business_id,
      pay_type: emp.pay_type, rate: emp.rate, units: 1,
      gross: 6500, ca_deduction: 0, adjustment: 0, net: 6500,
      status: 'paid', paid_at: '2026-06-12T00:00:00Z', payment_method: 'Cash',
    }).select().single()
    await client.from('payroll_payments').insert({
      entry_id: entry.id, amount: 6500, method: 'Cash', paid_at: '2026-06-12T00:00:00Z',
    })
    await client.from('settings').insert({ key: 'theme', value: { mode: 'dark' } })

    // Sanity: dirty state is in place (6 seed CAs + 1 extra).
    expect(await count('cash_advances')).toBe(SEED_CASH_ADVANCES.length + 1)
    expect(await count('payroll_payments')).toBe(1)

    await resetAllData(client)

    // Cash advances: old ones gone (incl. the extra), exactly the seed set remains.
    const { data: cas } = await client.from('cash_advances').select('*')
    expect(cas.length).toBe(SEED_CASH_ADVANCES.length)
    expect(cas.some(c => c.reason === 'EXTRA-NOT-SEED')).toBe(false)
    expect(cas.map(c => Number(c.amount)).sort((a, b) => a - b))
      .toEqual(SEED_CASH_ADVANCES.map(c => c.amount).sort((a, b) => a - b))

    // Reseeded cash advances point at the NEW employee rows.
    const { data: emps } = await client.from('employees').select('*')
    const empIds = new Set(emps.map(e => e.id))
    expect(cas.every(c => empIds.has(c.employee_id))).toBe(true)

    // Businesses + employees reseeded; payroll history and settings fully cleared.
    expect(await count('businesses')).toBe(SEED_BUSINESSES.length)
    expect(emps.length).toBe(SEED_EMPLOYEES.length)
    expect(await count('payroll_periods')).toBe(0)
    expect(await count('payroll_entries')).toBe(0)
    expect(await count('payroll_payments')).toBe(0)
    expect(await count('settings')).toBe(0)
  })

  it('wipeAllData empties every table in the wipe order', async () => {
    await resetAllData(client) // start from seeded state
    await wipeAllData(client)
    for (const [table] of WIPE_ORDER) {
      expect(await count(table), `${table} should be empty`).toBe(0)
    }
  })

  it('reset is idempotent — running twice still yields exactly the seed set', async () => {
    await resetAllData(client)
    await resetAllData(client)
    expect(await count('cash_advances')).toBe(SEED_CASH_ADVANCES.length)
    expect(await count('employees')).toBe(SEED_EMPLOYEES.length)
    expect(await count('businesses')).toBe(SEED_BUSINESSES.length)
  })
})
