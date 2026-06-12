// Pure payroll calculation engine.
// All money math is done in centavos (integers) to avoid floating point drift,
// but the public API accepts and returns pesos as numbers.

export const PAY_TYPES = {
  fixed: { label: 'Fixed Monthly', unitLabel: null },
  daily: { label: 'Daily', unitLabel: 'Days Worked' },
  per_unit: { label: 'Per Occupied Day / Booking', unitLabel: 'Count' },
}

export const BENEFITS = {
  sss: { label: 'SSS', flag: 'sss_enabled' },
  philhealth: { label: 'PhilHealth', flag: 'philhealth_enabled' },
  pagibig: { label: 'Pag-IBIG', flag: 'pagibig_enabled' },
}

// Default MONTHLY contribution amounts (editable in Settings).
// Deducted in full on the 2nd cutoff of each month; none on the 1st.
export const DEFAULT_BENEFIT_RATES = {
  sss_employee: 250,
  sss_employer: 510,
  philhealth_employee: 0,
  philhealth_employer: 0,
  pagibig_employee: 100,
  pagibig_employer: 100,
}

export const CUTOFFS = {
  1: { label: '1st Cutoff', range: (y, m) => `${monthName(m)} 1 – ${monthName(m)} 15, ${y}` },
  2: { label: '2nd Cutoff', range: (y, m) => `${monthName(m)} 16 – ${monthName(m)} ${lastDay(y, m)}, ${y}` },
}

export function monthName(m) {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'][m - 1]
}

export function lastDay(year, month) {
  return new Date(year, month, 0).getDate()
}

const toCents = (n) => Math.round((Number(n) || 0) * 100)
const toPesos = (c) => c / 100

// Gross pay per cutoff, by employee pay type.
//   fixed:    Monthly Salary / 2 (units ignored)
//   daily:    Days Worked x Daily Rate
//   per_unit: Count x Rate (occupied days or bookings)
export function computeGross(payType, rate, units = 0) {
  const r = toCents(rate)
  if (payType === 'fixed') return toPesos(Math.round(r / 2))
  if (payType === 'daily') return toPesos(Math.round(r * (Number(units) || 0)))
  if (payType === 'per_unit') return toPesos(Math.round(r * (Number(units) || 0)))
  throw new Error(`Unknown pay type: ${payType}`)
}

// Net = Gross - Cash Advances - Other Deductions - Employee Benefit Shares.
// Never below zero.
export function computeNet(gross, caDeduction = 0, otherDeduction = 0, employeeBenefits = 0) {
  const net = toCents(gross) - toCents(caDeduction) - toCents(otherDeduction) - toCents(employeeBenefits)
  return toPesos(Math.max(0, net))
}

// Company Cost = Gross + Employer Contributions.
export function computeCompanyCost(gross, employerContributions = 0) {
  return toPesos(toCents(gross) + toCents(employerContributions))
}

// Parse the legacy free-text benefits field into checkbox flags.
// "SSS, Pag-IBIG" -> { sss_enabled: true, philhealth_enabled: false, pagibig_enabled: true }
export function benefitsFromText(text) {
  const t = String(text || '').toLowerCase()
  return {
    sss_enabled: t.includes('sss'),
    philhealth_enabled: t.includes('philhealth'),
    pagibig_enabled: /pag[\s-]?ibig/.test(t),
  }
}

// Per-cutoff benefit snapshot for an employee. Government benefits deduct
// ONLY on the 2nd cutoff of the month, where the FULL monthly amount applies;
// the 1st cutoff has no benefit deductions or employer contributions.
// Disabled benefits always contribute zero.
export function computeBenefits(employee, rates = DEFAULT_BENEFIT_RATES, cutoff = 2) {
  const applies = Number(cutoff) === 2
  const out = {}
  let ee = 0, er = 0
  for (const [key, meta] of Object.entries(BENEFITS)) {
    const enabled = applies && !!employee?.[meta.flag]
    const eeCents = enabled ? toCents(rates[`${key}_employee`] ?? 0) : 0
    const erCents = enabled ? toCents(rates[`${key}_employer`] ?? 0) : 0
    out[`${key}_employee`] = toPesos(eeCents)
    out[`${key}_employer`] = toPesos(erCents)
    ee += eeCents
    er += erCents
  }
  out.total_employee_benefits = toPesos(ee)
  out.total_employer_contributions = toPesos(er)
  return out
}

// Sum of an employee's cash advances assigned to a specific cutoff.
export function cashAdvanceTotal(cashAdvances, employeeId, year, month, cutoff) {
  const cents = cashAdvances
    .filter(ca => ca.employee_id === employeeId &&
      Number(ca.year) === Number(year) &&
      Number(ca.month) === Number(month) &&
      Number(ca.cutoff) === Number(cutoff))
    .reduce((sum, ca) => sum + toCents(ca.amount), 0)
  return toPesos(cents)
}

// Build a payroll entry snapshot for an employee at generation time.
// Rates and computed values are frozen into the entry so later rate edits
// never change payroll history.
export function buildEntry(employee, { year, month, cutoff, units = 0, caDeduction = 0, otherDeduction = 0, benefitRates = DEFAULT_BENEFIT_RATES }) {
  const u = employee.pay_type === 'fixed' ? 1 : Number(units) || 0
  const gross = computeGross(employee.pay_type, employee.rate, u)
  const benefits = computeBenefits(employee, benefitRates, cutoff)
  return {
    employee_id: employee.id,
    business_id: employee.business_id,
    pay_type: employee.pay_type,
    rate: Number(employee.rate),
    units: u,
    gross,
    ca_deduction: Number(caDeduction) || 0,
    other_deduction: Number(otherDeduction) || 0,
    ...benefits,
    net: computeNet(gross, caDeduction, otherDeduction, benefits.total_employee_benefits),
    company_cost: computeCompanyCost(gross, benefits.total_employer_contributions),
    status: 'unpaid',
    paid_at: null,
    payment_method: null,
  }
}

// Recompute a single entry after units / deduction edits. Benefit amounts are
// snapshots and stay as-is here (see refreshEntryBenefits to re-apply rates).
// Paid entries are immutable — returned unchanged.
export function recomputeEntry(entry, { units, caDeduction, otherDeduction } = {}) {
  if (entry.status === 'paid') return entry
  const u = entry.pay_type === 'fixed' ? 1 : (units !== undefined ? Number(units) || 0 : entry.units)
  const ca = caDeduction !== undefined ? Number(caDeduction) || 0 : entry.ca_deduction
  const other = otherDeduction !== undefined ? Number(otherDeduction) || 0 : entry.other_deduction
  const gross = computeGross(entry.pay_type, entry.rate, u)
  return {
    ...entry, units: u, gross, ca_deduction: ca, other_deduction: other,
    net: computeNet(gross, ca, other, entry.total_employee_benefits || 0),
    company_cost: computeCompanyCost(gross, entry.total_employer_contributions || 0),
  }
}

// Re-apply current benefit settings to an entry (used when payroll is
// generated/updated). Only UNPAID entries are touched — changing benefit
// settings never silently changes paid payroll or frozen history.
export function refreshEntryBenefits(entry, employee, rates = DEFAULT_BENEFIT_RATES, cutoff = 2) {
  if (entry.status === 'paid') return entry
  const benefits = computeBenefits(employee, rates, cutoff)
  return {
    ...entry, ...benefits,
    net: computeNet(entry.gross, entry.ca_deduction, entry.other_deduction, benefits.total_employee_benefits),
    company_cost: computeCompanyCost(entry.gross, benefits.total_employer_contributions),
  }
}

// Mark paid: freeze status, payment date and method.
export function markPaid(entry, { method = 'Cash', paidAt = new Date().toISOString() } = {}) {
  if (entry.status === 'paid') return entry
  return { ...entry, status: 'paid', paid_at: paidAt, payment_method: method }
}

// Undo paid: fully reverse the payment.
export function undoPaid(entry) {
  if (entry.status !== 'paid') return entry
  return { ...entry, status: 'unpaid', paid_at: null, payment_method: null }
}

// Staff ordering used everywhere: Business, then Department, Position, Name.
export function employeeComparator(businesses) {
  const bizName = new Map((businesses || []).map(b => [b.id, b.name]))
  return (a = {}, b = {}) => {
    const ka = [bizName.get(a.business_id) || '', a.department || '', a.position || '', a.full_name || '']
    const kb = [bizName.get(b.business_id) || '', b.department || '', b.position || '', b.full_name || '']
    for (let i = 0; i < 4; i++) {
      const c = ka[i].localeCompare(kb[i])
      if (c) return c
    }
    return 0
  }
}

export function sortEmployees(employees, businesses) {
  return [...employees].sort(employeeComparator(businesses))
}

// Dashboard / payroll summary over a set of entries.
// Remaining Payable counts ONLY unpaid entries.
export function summarize(entries) {
  let gross = 0, net = 0, paid = 0, remaining = 0, ca = 0, other = 0, ee = 0, er = 0, cost = 0
  for (const e of entries) {
    gross += toCents(e.gross)
    net += toCents(e.net)
    ca += toCents(e.ca_deduction)
    other += toCents(e.other_deduction)
    ee += toCents(e.total_employee_benefits || 0)
    er += toCents(e.total_employer_contributions || 0)
    cost += toCents(e.company_cost ?? e.gross)
    if (e.status === 'paid') paid += toCents(e.net)
    else remaining += toCents(e.net)
  }
  return {
    grossPayroll: toPesos(gross),
    netPayroll: toPesos(net),
    paidPayroll: toPesos(paid),
    remainingPayable: toPesos(remaining),
    cashAdvancesDeducted: toPesos(ca),
    otherDeductions: toPesos(other),
    benefitsDeducted: toPesos(ee),
    employerContributions: toPesos(er),
    companyCost: toPesos(cost),
    totalDeductions: toPesos(ca + other + ee),
    entryCount: entries.length,
    paidCount: entries.filter(e => e.status === 'paid').length,
  }
}
