import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { monthName, CUTOFFS } from '../lib/payroll'
import { fmtMoney, fmtDate, todayISO } from '../lib/format'
import { Sheet, Button, Field, Input, Select, Textarea, Avatar, EmptyState, Confirm, useToast } from '../components/ui'

export default function CashAdvances({ period }) {
  const { cashAdvances, employees, businesses, saveCashAdvance, deleteCashAdvance } = useData()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // null | 'new' | ca object
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [monthFilter, setMonthFilter] = useState(`${period.year}-${period.month}`)

  const monthOptions = useMemo(() => {
    const keys = new Set(cashAdvances.map(c => `${c.year}-${c.month}`))
    keys.add(`${period.year}-${period.month}`)
    return [...keys].sort((a, b) => {
      const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number)
      return by - ay || bm - am
    })
  }, [cashAdvances, period])

  const list = useMemo(() => {
    if (monthFilter === 'all') return cashAdvances
    const [y, m] = monthFilter.split('-').map(Number)
    return cashAdvances.filter(c => c.year === y && c.month === m)
  }, [cashAdvances, monthFilter])

  const total = list.reduce((s, c) => s + Number(c.amount), 0)
  const empName = (id) => employees.find(e => e.id === id)?.full_name || 'Unknown'

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cash Advances</h1>
        <Button className="!h-9 !rounded-full !px-4 text-xs" onClick={() => setEditing('new')}>+ Add</Button>
      </header>

      <Select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="!h-9 !w-auto !rounded-full !bg-card !text-xs font-semibold">
        <option value="all">All Months</option>
        {monthOptions.map(k => {
          const [y, m] = k.split('-').map(Number)
          return <option key={k} value={k}>{monthName(m)} {y}</option>
        })}
      </Select>

      <section className="rounded-3xl border border-line/40 bg-hero-red p-5 backdrop-blur">
        <p className="text-xs font-medium text-danger">Total Cash Advances</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmtMoney(total)}</p>
        <p className="mt-1.5 text-xs text-ink3">{list.length} advance{list.length === 1 ? '' : 's'} · auto-deducted from the assigned cutoff</p>
      </section>

      <div className="space-y-2">
        {list.length === 0 && (
          <EmptyState icon="💳" title="No cash advances"
            hint="Advances you add here are automatically deducted from the employee's payroll for the assigned cutoff."
            action={<Button variant="soft" className="!h-9 !rounded-full !px-4 !text-xs" onClick={() => setEditing('new')}>+ Add Cash Advance</Button>} />
        )}
        {list.map(ca => (
          <button key={ca.id} onClick={() => setEditing(ca)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-card p-3.5 text-left transition hover:border-ink3">
            <Avatar name={empName(ca.employee_id)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{empName(ca.employee_id)}</p>
              <p className="truncate text-xs text-ink3">
                {fmtDate(ca.date)} · {ca.reason || 'No reason'} · {monthName(ca.month)} {CUTOFFS[ca.cutoff].label}
              </p>
            </div>
            <p className="text-sm font-bold text-danger">{fmtMoney(ca.amount)}</p>
          </button>
        ))}
      </div>

      <CashAdvanceSheet
        key={editing === 'new' ? 'new' : editing?.id || 'closed'}
        editing={editing}
        employees={employees}
        businesses={businesses}
        defaultPeriod={period}
        onClose={() => setEditing(null)}
        onDelete={(ca) => setConfirmDelete(ca)}
        onSave={async (form, id) => {
          try {
            await saveCashAdvance(form, id)
            toast(id ? 'Advance updated — unpaid payroll recomputed' : 'Advance added')
            setEditing(null)
          } catch (e) { toast(e.message, 'error') }
        }}
      />

      <Confirm
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete cash advance?"
        message={`Remove the ${fmtMoney(confirmDelete?.amount || 0)} advance for ${empName(confirmDelete?.employee_id)}? Unpaid payroll for that cutoff will be recomputed. Paid payroll is never changed.`}
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          try {
            await deleteCashAdvance(confirmDelete.id)
            toast('Advance deleted — unpaid payroll recomputed')
            setEditing(null)
          } catch (e) { toast(e.message, 'error') }
        }}
      />
    </div>
  )
}

function CashAdvanceSheet({ editing, employees, businesses, defaultPeriod, onClose, onSave, onDelete }) {
  const isNew = editing === 'new'
  const ca = isNew ? null : editing
  // Business is selected first; it is derived from the employee when editing.
  const [businessId, setBusinessId] = useState(() => (ca
    ? employees.find(e => e.id === ca.employee_id)?.business_id
    : businesses[0]?.id) || businesses[0]?.id || '')
  const [form, setForm] = useState(ca
    ? { ...ca, amount: String(ca.amount), reason: ca.reason || '', notes: ca.notes || '' }
    : {
        employee_id: '', date: todayISO(), amount: '', reason: '',
        year: defaultPeriod.year, month: defaultPeriod.month, cutoff: defaultPeriod.cutoff, notes: '',
      })
  const [busy, setBusy] = useState(false)
  const set = (k, num = false) => (e) => setForm(f => ({ ...f, [k]: num ? Number(e.target.value) : e.target.value }))

  // Only staff from the selected business, sorted by Department then Name.
  const staff = useMemo(() => employees
    .filter(e => e.business_id === businessId)
    .sort((a, b) =>
      (a.department || '').localeCompare(b.department || '') ||
      a.full_name.localeCompare(b.full_name)),
  [employees, businessId])

  if (!editing) return null
  const valid = form.employee_id && form.date && Number(form.amount) > 0

  return (
    <Sheet open={!!editing} onClose={onClose} title={isNew ? 'Add Cash Advance' : 'Edit Cash Advance'}>
      <div className="space-y-3.5">
        <Field label="Business">
          <Select value={businessId} onChange={e => {
            setBusinessId(e.target.value)
            setForm(f => ({ ...f, employee_id: '' })) // business changed -> clear employee
          }}>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Employee">
          <Select value={form.employee_id} onChange={set('employee_id')}>
            <option value="" disabled>Select employee…</option>
            {staff.map(e => (
              <option key={e.id} value={e.id}>
                {e.department ? `${e.department} — ` : ''}{e.full_name}{e.status === 'archived' ? ' (archived)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date Given">
            <Input type="date" value={form.date} onChange={set('date')} />
          </Field>
          <Field label="Amount (₱)">
            <Input type="number" inputMode="decimal" min="0" value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </Field>
        </div>
        <Field label="Reason">
          <Input value={form.reason} onChange={set('reason')} placeholder="Personal, Medical, Emergency…" />
        </Field>
        <p className="text-xs font-medium text-ink2">Deduct from payroll cutoff:</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Year">
            <Select value={form.year} onChange={set('year', true)}>
              {[form.year - 1, form.year, form.year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Month">
            <Select value={form.month} onChange={set('month', true)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}
            </Select>
          </Field>
          <Field label="Cutoff">
            <Select value={form.cutoff} onChange={set('cutoff', true)}>
              <option value={1}>1st</option>
              <option value={2}>2nd</option>
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Optional notes" />
        </Field>

        <div className="flex gap-3 pt-1">
          {!isNew && (
            <Button variant="dangerSoft" onClick={() => onDelete(ca)}>Delete</Button>
          )}
          <Button className="flex-1" disabled={!valid || busy}
            onClick={async () => { setBusy(true); await onSave(form, isNew ? null : ca.id); setBusy(false) }}>
            {busy ? 'Saving…' : isNew ? 'Add Advance' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
