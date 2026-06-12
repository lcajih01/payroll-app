import { useMemo, useState } from 'react'
import { useData } from '../context/DataContext'
import { PAY_TYPES, BENEFITS } from '../lib/payroll'
import { fmtMoney } from '../lib/format'
import { Sheet, Button, Field, Input, Select, Textarea, Avatar, Badge, SegmentedTabs, EmptyState, Confirm, CheckPill, useToast } from '../components/ui'

const EMPTY_FORM = {
  full_name: '', business_id: '', department: '', position: '',
  pay_type: 'fixed', rate: '', employment_status: 'Regular',
  sss_enabled: false, philhealth_enabled: false, pagibig_enabled: false,
  notes: '', status: 'active',
}

const benefitsLabel = (emp) =>
  Object.values(BENEFITS).filter(b => emp[b.flag]).map(b => b.label).join(' · ')

export default function Employees() {
  const { employees, businesses, saveEmployee, setEmployeeStatus } = useData()
  const toast = useToast()
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')
  const [bizFilter, setBizFilter] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | employee object
  const [confirmArchive, setConfirmArchive] = useState(null)

  const counts = {
    all: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    archived: employees.filter(e => e.status === 'archived').length,
  }

  const list = useMemo(() => employees.filter(e => {
    if (view !== 'all' && e.status !== view) return false
    if (bizFilter && e.business_id !== bizFilter) return false
    if (query && !e.full_name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  }), [employees, view, bizFilter, query])

  const bizName = (id) => businesses.find(b => b.id === id)?.name || '—'

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Employees</h1>
        <Button className="!h-9 !rounded-full !px-4 text-xs" onClick={() => setEditing('new')}>+ Add</Button>
      </header>

      <div className="flex gap-2">
        <Input placeholder="Search employees…" value={query} onChange={e => setQuery(e.target.value)} />
        <Select value={bizFilter} onChange={e => setBizFilter(e.target.value)} className="!w-40 shrink-0">
          <option value="">All Businesses</option>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      </div>

      <SegmentedTabs value={view} onChange={setView} tabs={[
        { value: 'all', label: `All (${counts.all})` },
        { value: 'active', label: `Active (${counts.active})` },
        { value: 'archived', label: `Archived (${counts.archived})` },
      ]} />

      <div className="space-y-2">
        {list.length === 0 && (
          <EmptyState icon="👥" title="No employees found"
            hint={query ? 'Try a different search.' : 'Add your first employee to get started.'}
            action={!query && (
              <Button variant="soft" className="!h-9 !rounded-full !px-4 !text-xs" onClick={() => setEditing('new')}>+ Add Employee</Button>
            )} />
        )}
        {list.map(emp => (
          <button key={emp.id} onClick={() => setEditing(emp)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-line/60 bg-card p-3.5 text-left transition hover:border-ink3">
            <Avatar name={emp.full_name} archived={emp.status === 'archived'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{emp.full_name}</p>
              <p className="truncate text-xs text-ink3">
                {emp.position || emp.department || '—'} · {PAY_TYPES[emp.pay_type].label}
              </p>
              <p className="truncate text-[11px] text-ink3">
                {bizName(emp.business_id)} · {fmtMoney(emp.rate)}{emp.pay_type === 'fixed' ? '/mo' : emp.pay_type === 'daily' ? '/day' : '/unit'}
                {benefitsLabel(emp) && <span className="text-accent/70"> · {benefitsLabel(emp)}</span>}
              </p>
            </div>
            <Badge kind={emp.status === 'active' ? 'ok' : 'muted'}>
              {emp.status === 'active' ? 'Active' : 'Archived'}
            </Badge>
          </button>
        ))}
      </div>

      <EmployeeSheet
        key={editing === 'new' ? 'new' : editing?.id || 'closed'}
        editing={editing}
        businesses={businesses}
        onClose={() => setEditing(null)}
        onArchiveToggle={(emp) => setConfirmArchive(emp)}
        onSave={async (form, id) => {
          try {
            await saveEmployee(form, id)
            toast(id ? 'Employee updated' : 'Employee added')
            setEditing(null)
          } catch (e) { toast(e.message, 'error') }
        }}
      />

      <Confirm
        open={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        title={confirmArchive?.status === 'active' ? 'Archive employee?' : 'Restore employee?'}
        message={confirmArchive?.status === 'active'
          ? `${confirmArchive?.full_name} will be hidden from payroll generation. Payroll history is kept.`
          : `${confirmArchive?.full_name} will be included in payroll generation again.`}
        confirmLabel={confirmArchive?.status === 'active' ? 'Archive' : 'Restore'}
        danger={confirmArchive?.status === 'active'}
        onConfirm={async () => {
          try {
            await setEmployeeStatus(confirmArchive.id, confirmArchive.status === 'active' ? 'archived' : 'active')
            toast(confirmArchive.status === 'active' ? 'Employee archived' : 'Employee restored')
            setEditing(null)
          } catch (e) { toast(e.message, 'error') }
        }}
      />
    </div>
  )
}

function EmployeeSheet({ editing, businesses, onClose, onSave, onArchiveToggle }) {
  const isNew = editing === 'new'
  const emp = isNew ? null : editing
  const [form, setForm] = useState(emp
    ? {
        ...EMPTY_FORM, ...emp, rate: String(emp.rate ?? ''),
        department: emp.department || '', position: emp.position || '', notes: emp.notes || '',
        sss_enabled: !!emp.sss_enabled, philhealth_enabled: !!emp.philhealth_enabled, pagibig_enabled: !!emp.pagibig_enabled,
      }
    : { ...EMPTY_FORM, business_id: businesses[0]?.id || '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  if (!editing) return null
  const valid = form.full_name.trim() && form.business_id && Number(form.rate) > 0

  return (
    <Sheet open={!!editing} onClose={onClose} title={isNew ? 'Add Employee' : 'Edit Employee'}>
      <div className="space-y-3.5">
        <Field label="Full Name">
          <Input value={form.full_name} onChange={set('full_name')} placeholder="e.g. Lei Renales" />
        </Field>
        <Field label="Business">
          <Select value={form.business_id} onChange={set('business_id')}>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department">
            <Input value={form.department} onChange={set('department')} placeholder="Housekeeping" />
          </Field>
          <Field label="Position">
            <Input value={form.position} onChange={set('position')} placeholder="Room Attendant" />
          </Field>
        </div>
        <Field label="Pay Type">
          <Select value={form.pay_type} onChange={set('pay_type')}>
            {Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field
          label={form.pay_type === 'fixed' ? 'Monthly Salary (₱)' : form.pay_type === 'daily' ? 'Daily Rate (₱)' : 'Rate per Occupied Day / Booking (₱)'}
          hint={form.pay_type === 'fixed' ? 'Each cutoff pays half of this amount.' : undefined}>
          <Input type="number" inputMode="decimal" min="0" value={form.rate} onChange={set('rate')} placeholder="0.00" />
        </Field>
        <Field label="Employment Status">
          <Select value={form.employment_status} onChange={set('employment_status')}>
            {['Regular', 'Probationary', 'Contractual', 'Part-time'].map(s => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Government Benefits" hint="Monthly contributions are set in Settings and deducted on the 2nd cutoff only.">
          <div className="flex gap-2">
            {Object.entries(BENEFITS).map(([key, b]) => (
              <CheckPill key={key} checked={form[b.flag]}
                onChange={(v) => setForm(f => ({ ...f, [b.flag]: v }))}>
                {b.label}
              </CheckPill>
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={set('notes')} placeholder="Optional notes" />
        </Field>

        <div className="flex gap-3 pt-1">
          {!isNew && (
            <Button variant={emp.status === 'active' ? 'dangerSoft' : 'ghost'} onClick={() => onArchiveToggle(emp)}>
              {emp.status === 'active' ? 'Archive' : 'Restore'}
            </Button>
          )}
          <Button className="flex-1" disabled={!valid || busy}
            onClick={async () => { setBusy(true); await onSave(form, isNew ? null : emp.id); setBusy(false) }}>
            {busy ? 'Saving…' : isNew ? 'Add Employee' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
