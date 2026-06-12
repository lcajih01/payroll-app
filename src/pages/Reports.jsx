import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { summarize, employeeComparator, monthName, CUTOFFS, PAY_TYPES } from '../lib/payroll'
import { fmtMoney, fmtDate } from '../lib/format'
import PayslipSheet from '../components/Payslip'
import { Badge, Button, EmptyState, useToast } from '../components/ui'

export default function Reports({ goTo }) {
  const { periods, entries, employees, businesses } = useData()
  const toast = useToast()
  const [openPeriodId, setOpenPeriodId] = useState(null)
  const [payslip, setPayslip] = useState(null) // { entry, period }

  const history = useMemo(() => {
    const cmp = employeeComparator(businesses)
    const empById = new Map(employees.map(emp => [emp.id, emp]))
    return periods.map(p => {
      const pe = entries
        .filter(e => e.period_id === p.id)
        .map(e => ({ ...e, employee: empById.get(e.employee_id) }))
        .sort((a, b) => cmp(a.employee, b.employee))
      return { ...p, entries: pe, summary: summarize(pe) }
    }).filter(p => p.entries.length > 0)
  }, [periods, entries, employees, businesses])

  const exportCSV = (p) => {
    const head = ['Employee', 'Business', 'Pay Type', 'Rate', 'Units', 'Gross', 'Cash Advance', 'Other Deductions',
      'SSS (EE)', 'PhilHealth (EE)', 'Pag-IBIG (EE)', 'Total Benefits (EE)', 'Net Pay',
      'SSS (ER)', 'PhilHealth (ER)', 'Pag-IBIG (ER)', 'Total Employer Share', 'Company Cost',
      'Status', 'Payment Method', 'Payment Date']
    const rows = p.entries.map(e => [
      e.employee?.full_name || 'Unknown',
      businesses.find(b => b.id === e.business_id)?.name || '',
      PAY_TYPES[e.pay_type].label,
      e.rate, e.units, e.gross, e.ca_deduction, e.other_deduction,
      e.sss_employee ?? 0, e.philhealth_employee ?? 0, e.pagibig_employee ?? 0, e.total_employee_benefits ?? 0, e.net,
      e.sss_employer ?? 0, e.philhealth_employer ?? 0, e.pagibig_employer ?? 0, e.total_employer_contributions ?? 0, e.company_cost ?? e.gross,
      e.status, e.payment_method || '', e.paid_at ? fmtDate(e.paid_at) : '',
    ])
    const csv = [head, ...rows]
      .map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `payroll-${p.year}-${String(p.month).padStart(2, '0')}-cutoff${p.cutoff}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('CSV downloaded')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>

      {history.length === 0 && (
        <EmptyState icon="📊" title="No payroll history yet"
          hint="Generate payroll first — every cutoff will appear here with payslips and CSV export."
          action={goTo && <Button variant="soft" className="!h-9 !rounded-full !px-4 !text-xs" onClick={() => goTo('payroll')}>Go to Payroll</Button>} />
      )}

      <div className="space-y-2.5">
        {history.map(p => {
          const open = openPeriodId === p.id
          const done = p.summary.remainingPayable === 0
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-line bg-card">
              <button className="flex w-full items-center justify-between p-4 text-left"
                onClick={() => setOpenPeriodId(open ? null : p.id)}>
                <div>
                  <p className="text-sm font-semibold">{monthName(p.month)} {p.year} · {CUTOFFS[p.cutoff].label}</p>
                  <p className="mt-0.5 text-xs text-ink3">
                    Net {fmtMoney(p.summary.netPayroll)} · Paid {fmtMoney(p.summary.paidPayroll)} · {p.entries.length} employees
                  </p>
                </div>
                <Badge kind={done ? 'ok' : 'warn'}>{done ? 'Completed' : 'In Progress'}</Badge>
              </button>

              {open && (
                <div className="anim-fade border-t border-line">
                  <div className="flex gap-2 p-3">
                    <Button variant="ghost" className="!h-9 flex-1 !text-xs" onClick={() => exportCSV(p)}>
                      ⬇ Export CSV
                    </Button>
                  </div>
                  <div className="divide-y divide-line">
                    {p.entries.map(e => (
                      <button key={e.id} onClick={() => setPayslip({ entry: e, period: p })}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-card2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.employee?.full_name || 'Unknown'}</p>
                          <p className="text-[11px] text-ink3">
                            {e.status === 'paid' ? `Paid · ${e.payment_method} · ${fmtDate(e.paid_at)}` : 'Unpaid'}
                          </p>
                        </div>
                        <p className={`text-sm font-bold ${e.status === 'paid' ? 'text-accent' : 'text-danger'}`}>
                          {fmtMoney(e.net)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <PayslipSheet
        entry={payslip?.entry}
        employee={payslip?.entry?.employee}
        business={businesses.find(b => b.id === payslip?.entry?.business_id)}
        period={payslip?.period || { year: 2026, month: 1, cutoff: 1 }}
        readOnly
        onClose={() => setPayslip(null)}
      />
    </div>
  )
}
