import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { summarize, employeeComparator, PAY_TYPES } from '../lib/payroll'
import { fmtMoney } from '../lib/format'
import PeriodPicker from '../components/PeriodPicker'
import PayslipSheet from '../components/Payslip'
import { Sheet, Button, Field, Input, Avatar, Badge, EmptyState, Confirm, useToast } from '../components/ui'

export default function Payroll({ period, setPeriod }) {
  const { employees, businesses, periods, entries, generatePayroll, updateEntry, markEntryPaid, undoEntryPaid, revertEntry } = useData()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [editingEntry, setEditingEntry] = useState(null)
  const [payslipEntry, setPayslipEntry] = useState(null)
  const [confirmRevert, setConfirmRevert] = useState(null) // paid entry pending revert

  const onRevert = async (entry) => {
    try {
      await revertEntry(entry.id)
      toast('Entry recalculated from current setup')
    } catch (e) { toast(e.message, 'error') }
  }

  const activePeriod = periods.find(p =>
    p.year === period.year && p.month === period.month && p.cutoff === period.cutoff)

  const scoped = useMemo(() => {
    if (!activePeriod) return []
    const cmp = employeeComparator(businesses)
    const empById = new Map(employees.map(emp => [emp.id, emp]))
    return entries
      .filter(e => e.period_id === activePeriod.id && (!period.businessId || e.business_id === period.businessId))
      .map(e => ({ ...e, employee: empById.get(e.employee_id) }))
      .sort((a, b) => cmp(a.employee, b.employee))
  }, [entries, activePeriod, period.businessId, employees, businesses])

  const s = summarize(scoped)
  const hasPayroll = scoped.length > 0
  // Keep the open payslip in sync with live data after mark paid / undo.
  const livePayslip = payslipEntry && scoped.find(e => e.id === payslipEntry.id)

  const onGenerate = async () => {
    setBusy(true)
    try {
      const res = await generatePayroll({ ...period, businessId: period.businessId })
      toast(res.created
        ? `Payroll generated for ${res.created} employee${res.created === 1 ? '' : 's'}`
        : `Payroll refreshed — ${res.refreshed} unpaid entr${res.refreshed === 1 ? 'y' : 'ies'} recalculated`)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Payroll</h1>
        {hasPayroll && (
          <Badge kind={s.remainingPayable === 0 ? 'ok' : 'warn'}>
            {s.paidCount}/{scoped.length} paid
          </Badge>
        )}
      </header>

      <PeriodPicker period={period} onChange={setPeriod} />

      <section className="grid grid-cols-2 gap-3">
        <Chip label="Gross" value={fmtMoney(s.grossPayroll)} />
        <Chip label="Net" value={fmtMoney(s.netPayroll)} />
        <Chip label="Paid" value={fmtMoney(s.paidPayroll)} accent />
        <Chip label="Remaining" value={fmtMoney(s.remainingPayable)} danger={s.remainingPayable > 0} />
        <Chip label="Benefits Deducted" value={fmtMoney(s.benefitsDeducted)} danger={s.benefitsDeducted > 0} />
        <Chip label="Company Cost (incl. employer share)" value={fmtMoney(s.companyCost)} />
      </section>

      <Button className="w-full" variant={hasPayroll ? 'soft' : 'primary'} disabled={busy} onClick={onGenerate}>
        {busy ? 'Working…' : hasPayroll ? 'Refresh Payroll' : 'Generate Payroll'}
      </Button>
      {hasPayroll && (
        <p className="-mt-2 text-center text-[11px] leading-relaxed text-ink3">
          Refresh recalculates all unpaid entries and adds missing employees. Paid entries stay locked.
        </p>
      )}

      <div className="space-y-2">
        {!hasPayroll && (
          <EmptyState icon="🧾" title="No payroll yet for this cutoff"
            hint="Generate payroll to compute pay for all active employees. Amounts are snapshotted, so later rate changes won't rewrite history." />
        )}
        {scoped.map(e => (
          <div key={e.id} className="rounded-2xl border border-line/60 bg-card p-3.5">
            <button className="press flex w-full items-center gap-3 rounded-xl text-left" onClick={() => setPayslipEntry(e)}>
              <Avatar name={e.employee?.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.employee?.full_name || 'Unknown'}</p>
                <p className="truncate text-xs text-ink3">
                  {PAY_TYPES[e.pay_type].label}
                  {e.pay_type !== 'fixed' && ` · ${e.units} ${e.pay_type === 'daily' ? 'day(s)' : 'unit(s)'}`}
                  {e.ca_deduction > 0 && ` · CA −${fmtMoney(e.ca_deduction)}`}
                  {Number(e.total_employee_benefits) > 0 && ` · Benefits −${fmtMoney(e.total_employee_benefits)}`}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${e.status === 'paid' ? 'text-accent' : ''}`}>{fmtMoney(e.net)}</p>
                <Badge kind={e.status === 'paid' ? 'ok' : 'danger'}>{e.status === 'paid' ? 'Paid' : 'Unpaid'}</Badge>
              </div>
            </button>
            <div className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
              {e.status === 'unpaid' ? (
                <>
                  <Button variant="ghost" className="!h-8 flex-1 !rounded-lg !text-xs" onClick={() => setEditingEntry(e)}>
                    {e.pay_type === 'fixed' ? 'Edit Deductions' : 'Edit Count'}
                  </Button>
                  <Button variant="ghost" className="!h-8 flex-1 !rounded-lg !text-xs" onClick={() => onRevert(e)}>
                    Revert
                  </Button>
                  <Button variant="soft" className="!h-8 flex-1 !rounded-lg !text-xs" onClick={() => setPayslipEntry(e)}>
                    Payslip / Pay
                  </Button>
                </>
              ) : (
                <Button variant="dangerSoft" className="!h-8 flex-1 !rounded-lg !text-xs" onClick={() => setConfirmRevert(e)}>
                  Revert to Unpaid & Recalculate
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <EditEntrySheet
        key={editingEntry?.id || 'closed'}
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={async (units, other) => {
          try {
            await updateEntry(editingEntry.id, { units, otherDeduction: other })
            toast('Entry recomputed')
            setEditingEntry(null)
          } catch (e) { toast(e.message, 'error') }
        }}
      />

      <Confirm
        open={!!confirmRevert}
        onClose={() => setConfirmRevert(null)}
        title="Revert this paid entry?"
        message={`${confirmRevert?.employee?.full_name || 'This employee'}'s ${fmtMoney(confirmRevert?.net || 0)} payment will be removed, the entry returns to Unpaid, and it is recalculated from the current employee setup and cash advances.`}
        confirmLabel="Revert & Recalculate"
        danger
        onConfirm={() => onRevert(confirmRevert)}
      />

      <PayslipSheet
        entry={livePayslip}
        employee={livePayslip?.employee}
        business={businesses.find(b => b.id === livePayslip?.business_id)}
        period={period}
        onClose={() => setPayslipEntry(null)}
        onMarkPaid={async (entry, method) => {
          try { await markEntryPaid(entry.id, method); toast('Marked as paid') }
          catch (e) { toast(e.message, 'error') }
        }}
        onUndoPaid={async (entry) => {
          try { await undoEntryPaid(entry.id); toast('Payment undone') }
          catch (e) { toast(e.message, 'error') }
        }}
      />
    </div>
  )
}

function Chip({ label, value, accent = false, danger = false }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3">
      <p className="text-[11px] text-ink3">{label}</p>
      <p className={`truncate text-base font-bold ${accent ? 'text-accent' : danger ? 'text-danger' : ''}`}>{value}</p>
    </div>
  )
}

function EditEntrySheet({ entry, onClose, onSave }) {
  const [units, setUnits] = useState(entry ? String(entry.units) : '0')
  const [other, setOther] = useState(entry ? String(entry.other_deduction) : '0')
  const [busy, setBusy] = useState(false)
  if (!entry) return null
  const unitLabel = PAY_TYPES[entry.pay_type].unitLabel

  return (
    <Sheet open={!!entry} onClose={onClose} title="Edit Payroll Entry">
      <div className="space-y-3.5">
        {unitLabel && (
          <Field label={unitLabel} hint={`Rate snapshot: ${fmtMoney(entry.rate)} ${entry.pay_type === 'daily' ? 'per day' : 'per occupied day / booking'}`}>
            <Input type="number" inputMode="decimal" min="0" value={units} onChange={e => setUnits(e.target.value)} />
          </Field>
        )}
        <Field label="Other Deductions (₱)" hint="Cash advances are deducted automatically and managed in the Advances tab.">
          <Input type="number" inputMode="decimal" min="0" value={other} onChange={e => setOther(e.target.value)} />
        </Field>
        <Button className="w-full" disabled={busy} onClick={async () => {
          setBusy(true)
          await onSave(Number(units) || 0, Number(other) || 0)
          setBusy(false)
        }}>
          {busy ? 'Saving…' : 'Recompute & Save'}
        </Button>
      </div>
    </Sheet>
  )
}
