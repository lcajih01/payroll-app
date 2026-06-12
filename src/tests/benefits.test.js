import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BENEFIT_RATES, benefitsFromText, computeBenefits, computeNet,
  computeCompanyCost, buildEntry, recomputeEntry, refreshEntryBenefits,
  markPaid, summarize,
} from '../lib/payroll'

const allBenefits = { sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true }
const cutoff1 = { year: 2026, month: 6, cutoff: 1 }
const cutoff2 = { year: 2026, month: 6, cutoff: 2 }

// Benefits deduct ONLY on the 2nd cutoff, at the FULL monthly amount.
// With default rates and all benefits on:
//   employee share = 250 + 0 + 100 = 350
//   employer share = 510 + 0 + 100 = 610
const EE = 350
const ER = 610

describe('benefit checkbox migration (legacy free-text field)', () => {
  it('detects SSS in old text', () => {
    expect(benefitsFromText('SSS')).toEqual({ sss_enabled: true, philhealth_enabled: false, pagibig_enabled: false })
    expect(benefitsFromText('sss, meals')).toMatchObject({ sss_enabled: true })
  })

  it('detects PhilHealth and Pag-IBIG variants', () => {
    expect(benefitsFromText('PhilHealth')).toMatchObject({ philhealth_enabled: true })
    expect(benefitsFromText('philhealth + pag-ibig')).toMatchObject({ philhealth_enabled: true, pagibig_enabled: true })
    expect(benefitsFromText('PagIBIG')).toMatchObject({ pagibig_enabled: true })
    expect(benefitsFromText('Pag Ibig')).toMatchObject({ pagibig_enabled: true })
  })

  it('detects all three together', () => {
    expect(benefitsFromText('SSS, PhilHealth, Pag-IBIG')).toEqual({
      sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true,
    })
  })

  it('leaves everything unchecked for empty, null or unrelated text', () => {
    const none = { sss_enabled: false, philhealth_enabled: false, pagibig_enabled: false }
    expect(benefitsFromText('')).toEqual(none)
    expect(benefitsFromText(null)).toEqual(none)
    expect(benefitsFromText(undefined)).toEqual(none)
    expect(benefitsFromText('free meals, uniform')).toEqual(none)
  })
})

describe('benefits apply on the 2nd cutoff only', () => {
  it('2nd cutoff deducts the FULL monthly amounts', () => {
    const b = computeBenefits({ ...allBenefits }, DEFAULT_BENEFIT_RATES, 2)
    expect(b.sss_employee).toBe(250)
    expect(b.sss_employer).toBe(510)
    expect(b.philhealth_employee).toBe(0)
    expect(b.philhealth_employer).toBe(0)
    expect(b.pagibig_employee).toBe(100)
    expect(b.pagibig_employer).toBe(100)
    expect(b.total_employee_benefits).toBe(EE)
    expect(b.total_employer_contributions).toBe(ER)
  })

  it('1st cutoff has no deductions or employer contributions at all', () => {
    const b = computeBenefits({ ...allBenefits }, DEFAULT_BENEFIT_RATES, 1)
    expect(b.sss_employee).toBe(0)
    expect(b.sss_employer).toBe(0)
    expect(b.pagibig_employee).toBe(0)
    expect(b.total_employee_benefits).toBe(0)
    expect(b.total_employer_contributions).toBe(0)
  })

  it('1st-cutoff entries pay full gross with company cost = gross', () => {
    const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff1 })
    expect(e.gross).toBe(6500)
    expect(e.total_employee_benefits).toBe(0)
    expect(e.net).toBe(6500)
    expect(e.company_cost).toBe(6500)
  })

  it('only calculates benefits when the employee checkbox is enabled', () => {
    const sssOnly = computeBenefits({ sss_enabled: true }, DEFAULT_BENEFIT_RATES, 2)
    expect(sssOnly.sss_employee).toBe(250)
    expect(sssOnly.pagibig_employee).toBe(0)
    expect(sssOnly.total_employee_benefits).toBe(250)
    expect(sssOnly.total_employer_contributions).toBe(510)

    const none = computeBenefits({}, DEFAULT_BENEFIT_RATES, 2)
    expect(none.total_employee_benefits).toBe(0)
    expect(none.total_employer_contributions).toBe(0)
  })

  it('uses edited settings rates', () => {
    const custom = { ...DEFAULT_BENEFIT_RATES, philhealth_employee: 400, philhealth_employer: 400 }
    const b = computeBenefits({ ...allBenefits }, custom, 2)
    expect(b.philhealth_employee).toBe(400)
    expect(b.philhealth_employer).toBe(400)
    expect(b.total_employee_benefits).toBe(EE + 400)
  })
})

describe('payroll with benefits (2nd cutoff)', () => {
  it('fixed salary with benefits', () => {
    const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2 })
    expect(e.gross).toBe(6500)
    expect(e.total_employee_benefits).toBe(EE)
    expect(e.net).toBe(6500 - EE)            // 6150
    expect(e.company_cost).toBe(6500 + ER)   // 7110
  })

  it('daily rate with benefits', () => {
    const emp = { id: 'e2', business_id: 'b1', pay_type: 'daily', rate: 450, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2, units: 13 })
    expect(e.gross).toBe(5850)
    expect(e.net).toBe(5850 - EE)            // 5500
    expect(e.company_cost).toBe(5850 + ER)   // 6460
  })

  it('per occupied day / booking with benefits', () => {
    const emp = { id: 'e3', business_id: 'b2', pay_type: 'per_unit', rate: 300, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2, units: 12 })
    expect(e.gross).toBe(3600)
    expect(e.net).toBe(3600 - EE)            // 3250
    expect(e.company_cost).toBe(3600 + ER)   // 4210
  })

  it('net pay = gross - cash advances - other deductions - employee benefits', () => {
    expect(computeNet(6500, 5000, 1000, EE)).toBe(6500 - 5000 - 1000 - 350) // 150
    const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2, caDeduction: 5000, otherDeduction: 1000 })
    expect(e.net).toBe(150)
  })

  it('company cost = gross + employer contributions (CA/other do not affect it)', () => {
    expect(computeCompanyCost(6500, ER)).toBe(7110)
    const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2, caDeduction: 5000 })
    expect(e.company_cost).toBe(7110)
  })

  it('editing units keeps benefit snapshots and recomputes net + company cost', () => {
    const emp = { id: 'e2', business_id: 'b1', pay_type: 'daily', rate: 450, ...allBenefits }
    const e = buildEntry(emp, { ...cutoff2, units: 10 })
    const r = recomputeEntry(e, { units: 13 })
    expect(r.gross).toBe(5850)
    expect(r.total_employee_benefits).toBe(EE) // snapshot kept
    expect(r.net).toBe(5850 - EE)
    expect(r.company_cost).toBe(5850 + ER)
  })

  it('summary aggregates benefits, employer contributions and company cost', () => {
    const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
    const noB = { id: 'e2', business_id: 'b1', pay_type: 'fixed', rate: 10000 }
    const s = summarize([buildEntry(emp, { ...cutoff2 }), buildEntry(noB, { ...cutoff2 })])
    expect(s.benefitsDeducted).toBe(EE)
    expect(s.employerContributions).toBe(ER)
    expect(s.companyCost).toBe(6500 + ER + 5000)
    expect(s.totalDeductions).toBe(EE)
  })
})

describe('benefit settings changes vs paid payroll', () => {
  const emp = { id: 'e1', business_id: 'b1', pay_type: 'fixed', rate: 13000, ...allBenefits }
  const doubled = { ...DEFAULT_BENEFIT_RATES, sss_employee: 500, sss_employer: 1020 }

  it('paid entries do not change after a benefit settings update', () => {
    const paid = markPaid(buildEntry(emp, { ...cutoff2 }), { method: 'Cash' })
    const after = refreshEntryBenefits(paid, emp, doubled, 2)
    expect(after).toBe(paid) // same reference — untouched
    expect(after.sss_employee).toBe(250)
    expect(after.net).toBe(6500 - EE)
  })

  it('unpaid entries pick up the new rates on refresh', () => {
    const unpaid = buildEntry(emp, { ...cutoff2 })
    const after = refreshEntryBenefits(unpaid, emp, doubled, 2)
    expect(after.sss_employee).toBe(500)
    expect(after.total_employee_benefits).toBe(500 + 0 + 100)
    expect(after.net).toBe(6500 - 600)
    expect(after.company_cost).toBe(6500 + 1020 + 0 + 100)
  })

  it('refreshing a 1st-cutoff entry keeps benefits at zero', () => {
    const unpaid = buildEntry(emp, { ...cutoff1 })
    const after = refreshEntryBenefits(unpaid, emp, doubled, 1)
    expect(after.total_employee_benefits).toBe(0)
    expect(after.net).toBe(6500)
    expect(after.company_cost).toBe(6500)
  })

  it('toggling an employee checkbox off zeroes its amounts on refresh (unpaid only)', () => {
    const unpaid = buildEntry(emp, { ...cutoff2 })
    const after = refreshEntryBenefits(unpaid, { ...emp, sss_enabled: false }, DEFAULT_BENEFIT_RATES, 2)
    expect(after.sss_employee).toBe(0)
    expect(after.total_employee_benefits).toBe(100)
    expect(after.net).toBe(6500 - 100)
  })
})
