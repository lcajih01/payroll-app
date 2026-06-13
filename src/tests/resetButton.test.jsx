// @vitest-environment jsdom
// Tests the ACTUAL Settings -> Reset Demo Data button path: real <Settings />
// + <DataProvider>, real supabase-js client, talking to the in-memory
// PostgREST mock — not just the helper function.
import { describe, it, expect, vi, afterAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '../components/ui'
import { DataProvider } from '../context/DataContext'
import Settings from '../pages/Settings'
import { SEED_CASH_ADVANCES, SEED_EMPLOYEES } from '../lib/seedData'

vi.mock('../lib/supabase', async () => {
  const { createMockServer } = await import('../../scripts/mock-supabase.mjs')
  const { createClient } = await import('@supabase/supabase-js')
  const server = createMockServer()
  await new Promise(resolve => server.listen(0, resolve))
  return {
    isConfigured: true,
    supabase: createClient(`http://127.0.0.1:${server.address().port}`, 'test-anon-key'),
    __mockServer: server,
  }
})

import { supabase, __mockServer } from '../lib/supabase'

afterAll(() => new Promise(resolve => __mockServer.close(resolve)))

describe('Settings -> Reset Demo Data button', () => {
  it('clears pre-existing cash advances and reseeds the demo set', async () => {
    render(
      <ToastProvider>
        <DataProvider>
          <Settings />
        </DataProvider>
      </ToastProvider>
    )

    // Wait until data has loaded into the app (businesses render in Settings).
    await screen.findByText('Home Stay Hotel', undefined, { timeout: 5000 })

    // Dirty the database behind the app: an extra cash advance + a payroll chain.
    const { data: emp } = await supabase.from('employees').select('*').limit(1).single()
    await supabase.from('cash_advances').insert({
      employee_id: emp.id, date: '2026-06-11', amount: 9999,
      reason: 'EXTRA-NOT-SEED', year: 2026, month: 6, cutoff: 1,
    })
    const { data: period } = await supabase.from('payroll_periods')
      .insert({ year: 2026, month: 6, cutoff: 1 }).select().single()
    await supabase.from('payroll_entries').insert({
      period_id: period.id, employee_id: emp.id, business_id: emp.business_id,
      pay_type: emp.pay_type, rate: emp.rate, units: 1, gross: 6500, net: 6500,
      ca_deduction: 0, adjustment: 0, status: 'unpaid', paid_at: null, payment_method: null,
    })
    const { data: dirtyCAs } = await supabase.from('cash_advances').select('*')
    expect(dirtyCAs.length).toBe(SEED_CASH_ADVANCES.length + 1)

    // Click the actual button, then confirm in the dialog.
    fireEvent.click(screen.getByText(/Reset Demo Data/))
    fireEvent.click(await screen.findByText('Reset Everything'))

    // Success toast appears once the reset completes.
    await screen.findByText('Demo data restored', undefined, { timeout: 10000 })

    // Cash advances were fully cleared and reseeded.
    const { data: cas } = await supabase.from('cash_advances').select('*')
    expect(cas.length).toBe(SEED_CASH_ADVANCES.length)
    expect(cas.some(c => c.reason === 'EXTRA-NOT-SEED')).toBe(false)

    // Reseeded CAs reference the new employee rows; payroll history is gone.
    const { data: emps } = await supabase.from('employees').select('*')
    expect(emps.length).toBe(SEED_EMPLOYEES.length)
    const empIds = new Set(emps.map(e => e.id))
    expect(cas.every(c => empIds.has(c.employee_id))).toBe(true)
    await waitFor(async () => {
      const { data: entries } = await supabase.from('payroll_entries').select('*')
      const { data: periods } = await supabase.from('payroll_periods').select('*')
      expect(entries.length).toBe(0)
      expect(periods.length).toBe(0)
    })

    // Reseeded employees carry checkbox benefits (not the legacy text field).
    expect(emps.every(e => typeof e.sss_enabled === 'boolean')).toBe(true)
    expect(emps.some(e => 'benefits' in e)).toBe(false)
  })
})
