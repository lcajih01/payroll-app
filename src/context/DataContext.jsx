import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildEntry, recomputeEntry, refreshEntryBenefits, markPaid, undoPaid, cashAdvanceTotal, benefitsFromText, sortEmployees, DEFAULT_BENEFIT_RATES } from '../lib/payroll'
import { wipeAllData, resetAllData } from '../lib/demoReset'

const DataContext = createContext(null)

export function useData() {
  return useContext(DataContext)
}

export function DataProvider({ children }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [employees, setEmployees] = useState([])
  const [cashAdvances, setCashAdvances] = useState([])
  const [periods, setPeriods] = useState([])
  const [entries, setEntries] = useState([])
  const [settingsRows, setSettingsRows] = useState([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [biz, emp, ca, per, ent, set] = await Promise.all([
        supabase.from('businesses').select('*').order('name'),
        supabase.from('employees').select('*').order('full_name'),
        supabase.from('cash_advances').select('*').order('date', { ascending: false }),
        supabase.from('payroll_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('cutoff', { ascending: false }),
        supabase.from('payroll_entries').select('*'),
        supabase.from('settings').select('*'),
      ])
      for (const r of [biz, emp, ca, per, ent, set]) {
        if (r.error) throw r.error
      }
      setBusinesses(biz.data)
      setEmployees(sortEmployees(emp.data, biz.data))
      setCashAdvances(ca.data)
      setPeriods(per.data)
      setEntries(ent.data)
      setSettingsRows(set.data)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Monthly government benefit amounts (settings override the defaults).
  const benefitRates = useMemo(() => {
    const row = settingsRows.find(s => s.key === 'benefit_rates')
    return { ...DEFAULT_BENEFIT_RATES, ...(row?.value || {}) }
  }, [settingsRows])

  const saveBenefitRates = useCallback(async (rates) => {
    const clean = {}
    for (const k of Object.keys(DEFAULT_BENEFIT_RATES)) clean[k] = Math.max(0, Number(rates[k]) || 0)
    const { data, error } = await supabase.from('settings')
      .upsert({ key: 'benefit_rates', value: clean }, { onConflict: 'key' })
      .select().single()
    if (error) throw error
    setSettingsRows(prev => [...prev.filter(s => s.key !== 'benefit_rates'), data])
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ---------- Employees ----------

  const saveEmployee = useCallback(async (form, id = null) => {
    const row = {
      business_id: form.business_id,
      full_name: form.full_name.trim(),
      department: form.department?.trim() || null,
      position: form.position?.trim() || null,
      pay_type: form.pay_type,
      rate: Number(form.rate) || 0,
      employment_status: form.employment_status || 'Regular',
      sss_enabled: !!form.sss_enabled,
      philhealth_enabled: !!form.philhealth_enabled,
      pagibig_enabled: !!form.pagibig_enabled,
      notes: form.notes?.trim() || null,
      status: form.status || 'active',
    }
    const q = id
      ? supabase.from('employees').update(row).eq('id', id).select().single()
      : supabase.from('employees').insert(row).select().single()
    const { data, error } = await q
    if (error) throw friendly(error, 'An employee with this name already exists for this business.')
    setEmployees(prev => sortEmployees(id ? prev.map(e => e.id === id ? data : e) : [...prev, data], businesses))
    return data
  }, [businesses])

  const setEmployeeStatus = useCallback(async (id, status) => {
    const { data, error } = await supabase.from('employees').update({ status }).eq('id', id).select().single()
    if (error) throw error
    setEmployees(prev => prev.map(e => e.id === id ? data : e))
  }, [])

  // ---------- Cash advances ----------

  // After any CA change, re-sync ca_deduction on UNPAID entries of the affected
  // employee+cutoff. Paid entries are never touched.
  const syncCaToEntries = useCallback(async (employeeId, year, month, cutoff, allCAs) => {
    const period = periods.find(p => p.year === year && p.month === month && p.cutoff === cutoff)
    if (!period) return
    const entry = entries.find(e => e.period_id === period.id && e.employee_id === employeeId)
    if (!entry || entry.status === 'paid') return
    const caTotal = cashAdvanceTotal(allCAs, employeeId, year, month, cutoff)
    const updated = recomputeEntry(entry, { caDeduction: caTotal })
    const { data, error } = await supabase.from('payroll_entries')
      .update({ ca_deduction: updated.ca_deduction, net: updated.net })
      .eq('id', entry.id).eq('status', 'unpaid').select().single()
    if (error) throw error
    setEntries(prev => prev.map(e => e.id === data.id ? data : e))
  }, [periods, entries])

  const saveCashAdvance = useCallback(async (form, id = null) => {
    const row = {
      employee_id: form.employee_id,
      date: form.date,
      amount: Number(form.amount) || 0,
      reason: form.reason?.trim() || null,
      year: Number(form.year),
      month: Number(form.month),
      cutoff: Number(form.cutoff),
      notes: form.notes?.trim() || null,
    }
    const prev = id ? cashAdvances.find(c => c.id === id) : null
    const q = id
      ? supabase.from('cash_advances').update(row).eq('id', id).select().single()
      : supabase.from('cash_advances').insert(row).select().single()
    const { data, error } = await q
    if (error) throw error
    const next = id ? cashAdvances.map(c => c.id === id ? data : c) : [data, ...cashAdvances]
    setCashAdvances(next)
    // Re-sync both the old and new cutoff buckets (they differ if CA was moved).
    await syncCaToEntries(data.employee_id, data.year, data.month, data.cutoff, next)
    if (prev && (prev.employee_id !== data.employee_id || prev.year !== data.year || prev.month !== data.month || prev.cutoff !== data.cutoff)) {
      await syncCaToEntries(prev.employee_id, prev.year, prev.month, prev.cutoff, next)
    }
    return data
  }, [cashAdvances, syncCaToEntries])

  const deleteCashAdvance = useCallback(async (id) => {
    const ca = cashAdvances.find(c => c.id === id)
    const { error } = await supabase.from('cash_advances').delete().eq('id', id)
    if (error) throw error
    const next = cashAdvances.filter(c => c.id !== id)
    setCashAdvances(next)
    if (ca) await syncCaToEntries(ca.employee_id, ca.year, ca.month, ca.cutoff, next)
  }, [cashAdvances, syncCaToEntries])

  // ---------- Payroll ----------

  // Generate (or refresh) payroll for a cutoff. Idempotent:
  //  - period is upserted on (year, month, cutoff)
  //  - entries are upserted on (period_id, employee_id)
  //  - existing PAID entries are never modified
  //  - existing UNPAID entries get refreshed CA totals but keep edited units/deductions
  const generatePayroll = useCallback(async ({ year, month, cutoff, businessId = null }) => {
    const { data: period, error: pErr } = await supabase
      .from('payroll_periods')
      .upsert({ year, month, cutoff }, { onConflict: 'year,month,cutoff' })
      .select().single()
    if (pErr) throw pErr

    const targets = employees.filter(e =>
      e.status === 'active' && (!businessId || e.business_id === businessId))

    const existing = entries.filter(e => e.period_id === period.id)
    const byEmployee = new Map(existing.map(e => [e.employee_id, e]))

    const inserts = []
    const updates = []
    for (const emp of targets) {
      const caTotal = cashAdvanceTotal(cashAdvances, emp.id, year, month, cutoff)
      const current = byEmployee.get(emp.id)
      if (!current) {
        inserts.push({ ...buildEntry(emp, { year, month, cutoff, caDeduction: caTotal, benefitRates }), period_id: period.id })
      } else if (current.status === 'unpaid') {
        // Keep owner-edited units & other deductions; refresh the CA total and
        // re-apply current benefit settings. Paid entries are never touched.
        const updated = refreshEntryBenefits(recomputeEntry(current, { caDeduction: caTotal }), emp, benefitRates, cutoff)
        updates.push({
          id: updated.id,
          ca_deduction: updated.ca_deduction,
          sss_employee: updated.sss_employee,
          philhealth_employee: updated.philhealth_employee,
          pagibig_employee: updated.pagibig_employee,
          sss_employer: updated.sss_employer,
          philhealth_employer: updated.philhealth_employer,
          pagibig_employer: updated.pagibig_employer,
          total_employee_benefits: updated.total_employee_benefits,
          total_employer_contributions: updated.total_employer_contributions,
          net: updated.net,
          company_cost: updated.company_cost,
        })
      }
    }

    if (inserts.length) {
      const { error } = await supabase.from('payroll_entries')
        .upsert(inserts, { onConflict: 'period_id,employee_id', ignoreDuplicates: true })
      if (error) throw error
    }
    for (const { id, ...fields } of updates) {
      const { error } = await supabase.from('payroll_entries')
        .update(fields)
        .eq('id', id).eq('status', 'unpaid')
      if (error) throw error
    }

    // Refresh local state from the server (entries got server-side ids/defaults).
    const [perRes, entRes] = await Promise.all([
      supabase.from('payroll_periods').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('cutoff', { ascending: false }),
      supabase.from('payroll_entries').select('*'),
    ])
    if (perRes.error) throw perRes.error
    if (entRes.error) throw entRes.error
    setPeriods(perRes.data)
    setEntries(entRes.data)
    return { period, created: inserts.length, refreshed: updates.length }
  }, [employees, entries, cashAdvances, benefitRates])

  // Edit units / other deduction on an unpaid entry; recomputes and persists.
  const updateEntry = useCallback(async (entryId, { units, otherDeduction }) => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry) throw new Error('Entry not found')
    if (entry.status === 'paid') throw new Error('Paid entries cannot be edited. Undo payment first.')
    const updated = recomputeEntry(entry, { units, otherDeduction })
    const { data, error } = await supabase.from('payroll_entries')
      .update({ units: updated.units, gross: updated.gross, other_deduction: updated.other_deduction, net: updated.net, company_cost: updated.company_cost })
      .eq('id', entryId).eq('status', 'unpaid').select().single()
    if (error) throw error
    setEntries(prev => prev.map(e => e.id === entryId ? data : e))
  }, [entries])

  const markEntryPaid = useCallback(async (entryId, method) => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.status === 'paid') return
    const paid = markPaid(entry, { method })
    const { data, error } = await supabase.from('payroll_entries')
      .update({ status: 'paid', paid_at: paid.paid_at, payment_method: paid.payment_method })
      .eq('id', entryId).eq('status', 'unpaid').select().single()
    if (error) throw error
    const { error: payErr } = await supabase.from('payroll_payments')
      .insert({ entry_id: entryId, amount: entry.net, method: paid.payment_method, paid_at: paid.paid_at })
    if (payErr) throw payErr
    setEntries(prev => prev.map(e => e.id === entryId ? data : e))
  }, [entries])

  const undoEntryPaid = useCallback(async (entryId) => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.status !== 'paid') return
    const reverted = undoPaid(entry)
    const { data, error } = await supabase.from('payroll_entries')
      .update({ status: 'unpaid', paid_at: null, payment_method: null })
      .eq('id', entryId).eq('status', 'paid').select().single()
    if (error) throw error
    const { error: payErr } = await supabase.from('payroll_payments').delete().eq('entry_id', entryId)
    if (payErr) throw payErr
    setEntries(prev => prev.map(e => e.id === entryId ? { ...reverted, ...data } : e))
  }, [entries])

  // ---------- Businesses / settings ----------

  const saveBusiness = useCallback(async (name, id = null) => {
    const q = id
      ? supabase.from('businesses').update({ name: name.trim() }).eq('id', id).select().single()
      : supabase.from('businesses').insert({ name: name.trim() }).select().single()
    const { data, error } = await q
    if (error) throw friendly(error, 'A business with this name already exists.')
    setBusinesses(prev => id ? prev.map(b => b.id === id ? data : b) : [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
  }, [])

  const backupJSON = useCallback(async () => {
    const { data: payments, error } = await supabase.from('payroll_payments').select('*')
    if (error) throw error
    return {
      exported_at: new Date().toISOString(),
      version: 3,
      businesses, employees, cash_advances: cashAdvances,
      payroll_periods: periods, payroll_entries: entries, payroll_payments: payments,
      settings: settingsRows,
    }
  }, [businesses, employees, cashAdvances, periods, entries, settingsRows])

  const restoreJSON = useCallback(async (dump) => {
    if (!dump || !Array.isArray(dump.businesses) || !Array.isArray(dump.employees)) {
      throw new Error('Invalid backup file: missing businesses/employees arrays.')
    }
    await wipeAllData(supabase)
    const insert = async (table, rows) => {
      if (!rows?.length) return
      const { error } = await supabase.from(table).insert(rows)
      if (error) throw error
    }
    // Migrate employees from old backups where benefits was a free-text field.
    const employeeRows = dump.employees.map(({ benefits, ...e }) =>
      e.sss_enabled === undefined && benefits !== undefined
        ? { ...benefitsFromText(benefits), ...e }
        : e)
    await insert('businesses', dump.businesses)
    await insert('employees', employeeRows)
    await insert('cash_advances', dump.cash_advances)
    await insert('payroll_periods', dump.payroll_periods)
    await insert('payroll_entries', dump.payroll_entries)
    await insert('payroll_payments', dump.payroll_payments)
    await insert('settings', dump.settings)
    await loadAll()
  }, [loadAll])

  const resetDemoData = useCallback(async () => {
    await resetAllData(supabase)
    await loadAll()
  }, [loadAll])

  const fetchPayments = useCallback(async (entryId) => {
    const { data, error } = await supabase.from('payroll_payments').select('*').eq('entry_id', entryId)
    if (error) throw error
    return data
  }, [])

  const value = useMemo(() => ({
    loading, error, loadAll,
    businesses, employees, cashAdvances, periods, entries,
    benefitRates, saveBenefitRates,
    saveEmployee, setEmployeeStatus,
    saveCashAdvance, deleteCashAdvance,
    generatePayroll, updateEntry, markEntryPaid, undoEntryPaid,
    saveBusiness, backupJSON, restoreJSON, resetDemoData, fetchPayments,
  }), [loading, error, loadAll, businesses, employees, cashAdvances, periods, entries,
    benefitRates, saveBenefitRates,
    saveEmployee, setEmployeeStatus, saveCashAdvance, deleteCashAdvance,
    generatePayroll, updateEntry, markEntryPaid, undoEntryPaid,
    saveBusiness, backupJSON, restoreJSON, resetDemoData, fetchPayments])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

function friendly(error, duplicateMessage) {
  if (error.code === '23505') return new Error(duplicateMessage)
  return error
}
