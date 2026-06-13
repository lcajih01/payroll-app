import { describe, it, expect } from 'vitest'
import {
  computeGross, computeNet, cashAdvanceTotal,
  buildEntry, recomputeEntry, markPaid, undoPaid, summarize,
} from '../lib/payroll'

const fixedEmp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000 }
const dailyEmp = { id: 'e2', business_id: 'b1', pay_type: 'daily', rate: 450 }
const perUnitEmp = { id: 'e3', business_id: 'b2', pay_type: 'per_unit', rate: 300 }
const cutoff = { year: 2026, month: 6, cutoff: 1 }

describe('gross pay', () => {
  it('fixed monthly: gross = monthly salary / 2', () => {
    expect(computeGross('fixed', 13000)).toBe(6500)
    expect(computeGross('fixed', 15000)).toBe(7500)
    expect(computeGross('fixed', 0)).toBe(0)
  })

  it('fixed monthly handles odd centavo splits without float drift', () => {
    expect(computeGross('fixed', 10001)).toBe(5000.5)
    expect(computeGross('fixed', 333.33)).toBe(166.67) // rounds half-up at centavo level
  })

  it('daily: gross = days worked x daily rate', () => {
    expect(computeGross('daily', 450, 13)).toBe(5850)
    expect(computeGross('daily', 450, 0)).toBe(0)
    expect(computeGross('daily', 537.5, 11)).toBe(5912.5)
  })

  it('per occupied day / booking: gross = count x rate', () => {
    expect(computeGross('per_unit', 300, 12)).toBe(3600)
    expect(computeGross('per_unit', 250, 0)).toBe(0)
  })

  it('rejects unknown pay types', () => {
    expect(() => computeGross('hourly', 100, 8)).toThrow()
  })
})

describe('cash advance deduction', () => {
  const cas = [
    { employee_id: 'e1', amount: 3000, year: 2026, month: 6, cutoff: 1 },
    { employee_id: 'e1', amount: 2000, year: 2026, month: 6, cutoff: 1 },
    { employee_id: 'e1', amount: 999, year: 2026, month: 6, cutoff: 2 }, // other cutoff
    { employee_id: 'e2', amount: 500, year: 2026, month: 6, cutoff: 1 }, // other employee
    { employee_id: 'e1', amount: 750, year: 2026, month: 5, cutoff: 1 }, // other month
  ]

  it('sums only the matching employee + year + month + cutoff', () => {
    expect(cashAdvanceTotal(cas, 'e1', 2026, 6, 1)).toBe(5000)
    expect(cashAdvanceTotal(cas, 'e1', 2026, 6, 2)).toBe(999)
    expect(cashAdvanceTotal(cas, 'e2', 2026, 6, 1)).toBe(500)
    expect(cashAdvanceTotal(cas, 'e3', 2026, 6, 1)).toBe(0)
  })

  it('net = gross + adjustment - cash advances', () => {
    expect(computeNet(6500, { caDeduction: 5000 })).toBe(1500)
    expect(computeNet(6500, { caDeduction: 5000, adjustment: -1000 })).toBe(500)  // negative adjustment deducts
    expect(computeNet(6500, { caDeduction: 5000, adjustment: 1000 })).toBe(2500)  // positive adjustment adds
    expect(computeNet(5850)).toBe(5850)
  })

  it('net never goes below zero', () => {
    expect(computeNet(1000, { caDeduction: 5000 })).toBe(0)
    expect(computeNet(1000, { adjustment: -5000 })).toBe(0)
  })

  it('decimal-safe: 0.1 + 0.2 style amounts do not drift', () => {
    expect(computeNet(100.1, { caDeduction: 100.2 - 100 })).toBe(99.9)
  })
})

describe('entry generation (snapshot semantics)', () => {
  it('builds a fixed-monthly entry with rate snapshot', () => {
    const e = buildEntry(fixedEmp, { ...cutoff, caDeduction: 5000 })
    expect(e).toMatchObject({
      employee_id: 'e1', pay_type: 'fixed', rate: 13000, units: 1,
      gross: 6500, ca_deduction: 5000, net: 1500, status: 'unpaid',
    })
  })

  it('builds daily and per-unit entries from units', () => {
    expect(buildEntry(dailyEmp, { ...cutoff, units: 13 })).toMatchObject({ gross: 5850, net: 5850 })
    expect(buildEntry(perUnitEmp, { ...cutoff, units: 12, caDeduction: 600 })).toMatchObject({ gross: 3600, net: 3000 })
  })

  it('rate edits after generation do not change the entry (history is frozen)', () => {
    const e = buildEntry(dailyEmp, { ...cutoff, units: 10 }) // 4500
    dailyEmp.rate = 999 // employee record changes later
    const recomputed = recomputeEntry(e, { units: 10 })
    expect(recomputed.gross).toBe(4500) // still uses the snapshotted 450
    dailyEmp.rate = 450
  })

  it('recompute updates units and adjustment for unpaid entries', () => {
    const e = buildEntry(dailyEmp, { ...cutoff, units: 10 })
    const r = recomputeEntry(e, { units: 12, adjustment: -200 })
    expect(r.gross).toBe(5400)
    expect(r.net).toBe(5200)  // 5400 - 200
    const r2 = recomputeEntry(e, { units: 12, adjustment: 200 })
    expect(r2.net).toBe(5600) // 5400 + 200
  })

  it('recompute is a no-op on paid entries', () => {
    const e = markPaid(buildEntry(dailyEmp, { ...cutoff, units: 10 }))
    const r = recomputeEntry(e, { units: 99, caDeduction: 9999 })
    expect(r).toBe(e) // unchanged, same reference
    expect(r.gross).toBe(4500)
  })
})

describe('mark paid / undo paid', () => {
  it('mark paid sets status, payment date and method', () => {
    const e = buildEntry(fixedEmp, { ...cutoff })
    const paid = markPaid(e, { method: 'GCash', paidAt: '2026-06-16T08:00:00Z' })
    expect(paid.status).toBe('paid')
    expect(paid.payment_method).toBe('GCash')
    expect(paid.paid_at).toBe('2026-06-16T08:00:00Z')
    expect(paid.net).toBe(e.net) // amounts untouched
  })

  it('marking an already-paid entry is a no-op', () => {
    const paid = markPaid(buildEntry(fixedEmp, { ...cutoff }), { method: 'Cash', paidAt: 'x' })
    expect(markPaid(paid, { method: 'GCash' })).toBe(paid)
  })

  it('undo paid fully reverses the payment', () => {
    const e = buildEntry(fixedEmp, { ...cutoff, caDeduction: 1000 })
    const undone = undoPaid(markPaid(e, { method: 'Bank Transfer' }))
    expect(undone).toMatchObject({ status: 'unpaid', paid_at: null, payment_method: null })
    expect(undone.gross).toBe(e.gross)
    expect(undone.net).toBe(e.net)
  })

  it('undo on an unpaid entry is a no-op', () => {
    const e = buildEntry(fixedEmp, { ...cutoff })
    expect(undoPaid(e)).toBe(e)
  })
})

describe('summary / remaining payable', () => {
  const entries = [
    markPaid(buildEntry(fixedEmp, { ...cutoff, caDeduction: 5000 }), { method: 'Cash' }), // net 1500, paid
    buildEntry(dailyEmp, { ...cutoff, units: 13 }),                                       // net 5850, unpaid
    buildEntry(perUnitEmp, { ...cutoff, units: 12, adjustment: -600 }),                   // net 3000, unpaid
  ]

  it('remaining payable includes ONLY unpaid payroll', () => {
    const s = summarize(entries)
    expect(s.remainingPayable).toBe(8850) // 5850 + 3000
    expect(s.paidPayroll).toBe(1500)
    expect(s.grossPayroll).toBe(6500 + 5850 + 3600)
    expect(s.netPayroll).toBe(1500 + 5850 + 3000)
    expect(s.cashAdvancesDeducted).toBe(5000)
    expect(s.adjustments).toBe(-600)         // signed sum of adjustments
    expect(s.totalDeductions).toBe(5000)     // ca + benefits only; adjustment excluded
    expect(s.paidCount).toBe(1)
  })

  it('mark paid moves net from remaining to paid; undo reverses it', () => {
    const before = summarize(entries)
    const paid = entries.map(e => e.status === 'unpaid' ? markPaid(e, { method: 'Cash' }) : e)
    const after = summarize(paid)
    expect(after.remainingPayable).toBe(0)
    expect(after.paidPayroll).toBe(before.paidPayroll + before.remainingPayable)
    expect(after.netPayroll).toBe(before.netPayroll) // totals unchanged

    const undone = paid.map(undoPaid)
    const reverted = summarize(undone)
    expect(reverted.remainingPayable).toBe(reverted.netPayroll)
    expect(reverted.paidPayroll).toBe(0)
  })

  it('empty payroll summarizes to zeros', () => {
    const s = summarize([])
    expect(s.remainingPayable).toBe(0)
    expect(s.grossPayroll).toBe(0)
    expect(s.entryCount).toBe(0)
  })
})
