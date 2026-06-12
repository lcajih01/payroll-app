import { useState } from 'react'
import { Sheet, Button, Badge, Field, Select, Confirm } from './ui'
import { fmtMoney, fmtDate } from '../lib/format'
import { PAY_TYPES, CUTOFFS, BENEFITS, monthName } from '../lib/payroll'

const PAYMENT_METHODS = ['Cash', 'GCash', 'Bank Transfer', 'Check']
const BENEFIT_KEYS = Object.keys(BENEFITS)

export default function PayslipSheet({ entry, employee, business, period, onClose, onMarkPaid, onUndoPaid, readOnly = false }) {
  const [method, setMethod] = useState('Cash')
  const [busy, setBusy] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  if (!entry) return null
  const paid = entry.status === 'paid'

  const act = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <Sheet open={!!entry} onClose={onClose} title="Payslip">
      <div className="print-area space-y-4">
        {/* Header card */}
        <div className={`rounded-2xl p-4 ${paid ? 'bg-accent-deep' : 'bg-danger-dim'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-bold">{employee?.full_name || 'Unknown employee'}</p>
              <p className="text-xs text-ink2">{employee?.position || '—'}{business ? ` · ${business.name}` : ''}</p>
            </div>
            <Badge kind={paid ? 'ok' : 'danger'}>{paid ? 'PAID' : 'UNPAID'}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-ink3">Payroll Period</p>
              <p className="font-medium">{CUTOFFS[period.cutoff].range(period.year, period.month)}</p>
            </div>
            <div>
              <p className="text-ink3">Pay Type</p>
              <p className="font-medium">{PAY_TYPES[entry.pay_type].label}</p>
            </div>
          </div>
        </div>

        {/* Amounts */}
        <div className="space-y-2.5 rounded-2xl border border-line bg-card2 p-4 text-sm">
          <Row label={grossLabel(entry)} value={fmtMoney(entry.gross)} />
          <Row label="Cash Advance" value={entry.ca_deduction ? `− ${fmtMoney(entry.ca_deduction)}` : fmtMoney(0)} dim={!entry.ca_deduction} />
          <Row label="Other Deductions" value={entry.other_deduction ? `− ${fmtMoney(entry.other_deduction)}` : fmtMoney(0)} dim={!entry.other_deduction} />
          {BENEFIT_KEYS.filter(k => Number(entry[`${k}_employee`]) > 0).map(k => (
            <Row key={k} label={`${BENEFITS[k].label} (employee share)`} value={`− ${fmtMoney(entry[`${k}_employee`])}`} />
          ))}
          <div className="border-t border-line pt-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Net Pay</span>
              <span className={`text-lg font-bold ${paid ? 'text-accent' : 'text-danger'}`}>{fmtMoney(entry.net)}</span>
            </div>
          </div>
        </div>

        {/* Employer contributions (company side — not deducted from the employee) */}
        {Number(entry.total_employer_contributions) > 0 && (
          <div className="space-y-2 rounded-2xl border border-line bg-card2 p-4 text-xs">
            <p className="font-semibold text-ink2">Employer Contributions</p>
            {BENEFIT_KEYS.filter(k => Number(entry[`${k}_employer`]) > 0).map(k => (
              <Row key={k} label={BENEFITS[k].label} value={fmtMoney(entry[`${k}_employer`])} />
            ))}
            <div className="border-t border-line pt-2">
              <Row label="Total Employer Share" value={fmtMoney(entry.total_employer_contributions)} />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-semibold">Company Cost (gross + employer share)</span>
                <span className="font-bold">{fmtMoney(entry.company_cost ?? entry.gross)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Payment info */}
        <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-card2 p-4 text-xs">
          <div>
            <p className="text-ink3">Status</p>
            <p className={`font-semibold ${paid ? 'text-accent' : 'text-danger'}`}>{paid ? 'PAID' : 'UNPAID'}</p>
          </div>
          <div>
            <p className="text-ink3">Payment Method</p>
            <p className="font-medium">{entry.payment_method || '—'}</p>
          </div>
          <div>
            <p className="text-ink3">Payment Date</p>
            <p className="font-medium">{fmtDate(entry.paid_at)}</p>
          </div>
        </div>

        {!readOnly && !paid && (
          <Field label="Payment Method">
            <Select value={method} onChange={e => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        )}

        <div className="no-print space-y-2.5 pt-1">
          {!readOnly && (paid
            ? <Button variant="dangerSoft" className="w-full" disabled={busy}
                onClick={() => setConfirmUndo(true)}>Undo Paid</Button>
            : <Button variant="danger" className="w-full" disabled={busy}
                onClick={() => act(() => onMarkPaid(entry, method))}>Mark as Paid</Button>
          )}
          <Button variant="ghost" className="w-full" onClick={() => window.print()}>
            Download / Print
          </Button>
        </div>
      </div>

      <Confirm
        open={confirmUndo}
        onClose={() => setConfirmUndo(false)}
        title="Undo this payment?"
        message={`${employee?.full_name || 'This employee'}'s ${fmtMoney(entry.net)} payment will be reversed: the entry returns to Unpaid and the payment record is removed.`}
        confirmLabel="Undo Payment"
        danger
        onConfirm={() => act(() => onUndoPaid(entry))}
      />
    </Sheet>
  )
}

function grossLabel(entry) {
  if (entry.pay_type === 'fixed') return `Gross Pay (½ of ${fmtMoney(entry.rate)})`
  if (entry.pay_type === 'daily') return `Gross Pay (${entry.units} day${entry.units === 1 ? '' : 's'} × ${fmtMoney(entry.rate)})`
  return `Gross Pay (${entry.units} × ${fmtMoney(entry.rate)})`
}

function Row({ label, value, dim = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink2">{label}</span>
      <span className={`font-medium ${dim ? 'text-ink3' : ''}`}>{value}</span>
    </div>
  )
}
