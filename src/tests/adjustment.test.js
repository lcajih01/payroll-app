import { describe, it, expect } from 'vitest'
import { computeNet, buildEntry, recomputeEntry, summarize } from '../lib/payroll'
import { fmtSigned } from '../lib/format'

const cutoff = { year: 2026, month: 6, cutoff: 1 } // 1st cutoff: no benefits, isolates adjustment
const fixed = { id: 'f', business_id: 'b', pay_type: 'fixed', rate: 13000 }   // gross 6500
const daily = { id: 'd', business_id: 'b', pay_type: 'daily', rate: 450 }     // gross = days × 450
const perUnit = { id: 'p', business_id: 'b', pay_type: 'per_unit', rate: 300 } // gross = units × 300

describe('adjustment in net pay formula', () => {
  it('positive adjustment ADDS to salary', () => {
    expect(computeNet(6500, { adjustment: 500 })).toBe(7000)
    expect(buildEntry(fixed, { ...cutoff, adjustment: 500 }).net).toBe(7000)
  })

  it('negative adjustment DEDUCTS from salary', () => {
    expect(computeNet(6500, { adjustment: -500 })).toBe(6000)
    expect(buildEntry(fixed, { ...cutoff, adjustment: -500 }).net).toBe(6000)
  })

  it('zero / missing adjustment leaves net unchanged', () => {
    expect(computeNet(6500, {})).toBe(6500)
    expect(buildEntry(fixed, { ...cutoff }).adjustment).toBe(0)
    expect(buildEntry(fixed, { ...cutoff }).net).toBe(6500)
  })

  it('full formula: Net = Gross + Adjustment - Cash Advances - Employee Benefits', () => {
    // 1st cutoff so benefits are zero; combine adjustment with a cash advance.
    const e = buildEntry(fixed, { ...cutoff, adjustment: -500, caDeduction: 1000 })
    expect(e.net).toBe(6500 - 500 - 1000) // 5000
    const e2 = buildEntry(fixed, { ...cutoff, adjustment: 500, caDeduction: 1000 })
    expect(e2.net).toBe(6500 + 500 - 1000) // 6000
  })

  it('applies to every pay type', () => {
    expect(buildEntry(daily, { ...cutoff, units: 10, adjustment: 250 }).net).toBe(4500 + 250)
    expect(buildEntry(daily, { ...cutoff, units: 10, adjustment: -250 }).net).toBe(4500 - 250)
    expect(buildEntry(perUnit, { ...cutoff, units: 12, adjustment: 600 }).net).toBe(3600 + 600)
    expect(buildEntry(perUnit, { ...cutoff, units: 12, adjustment: -600 }).net).toBe(3600 - 600)
  })

  it('adjustment never drives net below zero', () => {
    expect(buildEntry(fixed, { ...cutoff, adjustment: -99999 }).net).toBe(0)
  })

  it('adjustment does NOT change company cost', () => {
    const base = buildEntry(fixed, { ...cutoff }).company_cost
    expect(buildEntry(fixed, { ...cutoff, adjustment: 500 }).company_cost).toBe(base)
    expect(buildEntry(fixed, { ...cutoff, adjustment: -500 }).company_cost).toBe(base)
  })

  it('recompute can flip an adjustment from deduction to additional pay', () => {
    const e = buildEntry(fixed, { ...cutoff, adjustment: -500 }) // net 6000
    expect(e.net).toBe(6000)
    const r = recomputeEntry(e, { adjustment: 500 })
    expect(r.adjustment).toBe(500)
    expect(r.net).toBe(7000)
  })

  it('migration intent: a former other_deduction of 500 equals an adjustment of -500', () => {
    // Old behaviour deducted 500; new equivalent is adjustment -500 — same net.
    expect(buildEntry(fixed, { ...cutoff, adjustment: -500 }).net).toBe(6000)
  })

  it('summary reports the signed net of all adjustments', () => {
    const s = summarize([
      buildEntry(fixed, { ...cutoff, adjustment: 500 }),
      buildEntry(daily, { ...cutoff, units: 10, adjustment: -200 }),
    ])
    expect(s.adjustments).toBe(300) // 500 + (-200)
  })
})

describe('signed money formatting for adjustments', () => {
  it('formats positive, negative and zero', () => {
    expect(fmtSigned(500)).toBe('+₱500.00')
    expect(fmtSigned(-500)).toBe('-₱500.00')
    expect(fmtSigned(0)).toBe('₱0.00')
  })
})
