import { useEffect, useRef, useState } from 'react'
import { useData } from '../context/DataContext'
import { BENEFITS } from '../lib/payroll'
import { fmtMoney } from '../lib/format'
import { Sheet, Button, Field, Input, Confirm, useToast } from '../components/ui'

export default function Settings() {
  const { businesses, saveBusiness, backupJSON, restoreJSON, resetDemoData } = useData()
  const toast = useToast()
  const fileRef = useRef(null)
  const [editingBiz, setEditingBiz] = useState(null) // null | 'new' | business
  const [confirm, setConfirm] = useState(null) // null | 'reset' | { restore: dump }
  const [busy, setBusy] = useState(false)

  const onBackup = async () => {
    try {
      const dump = await backupJSON()
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `payroll-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('Backup downloaded')
    } catch (e) { toast(e.message, 'error') }
  }

  const onPickRestore = async (file) => {
    try {
      const dump = JSON.parse(await file.text())
      setConfirm({ restore: dump })
    } catch {
      toast('Could not read that file — is it a valid JSON backup?', 'error')
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Settings</h1>

      <Section title="Businesses">
        <div className="space-y-2">
          {businesses.map(b => (
            <button key={b.id} onClick={() => setEditingBiz(b)}
              className="flex w-full items-center justify-between rounded-xl border border-line bg-card2 px-4 py-3 text-left text-sm font-medium transition hover:border-ink3">
              {b.name}
              <span className="text-xs text-ink3">Rename ›</span>
            </button>
          ))}
          <Button variant="ghost" className="w-full !text-xs" onClick={() => setEditingBiz('new')}>+ Add Business</Button>
        </div>
      </Section>

      <BenefitRatesSection />

      <Section title="Data">
        <div className="space-y-2.5">
          <Button variant="ghost" className="w-full" onClick={onBackup} disabled={busy}>⬇ Backup JSON</Button>
          <Button variant="ghost" className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>⬆ Restore JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPickRestore(f) }} />
          <Button variant="dangerSoft" className="w-full" onClick={() => setConfirm('reset')} disabled={busy}>
            ↺ Reset Demo Data
          </Button>
          <p className="text-[11px] leading-relaxed text-ink3">
            Backup downloads every table as JSON. Restore and Reset replace <span className="text-ink2">all</span> current data — take a backup first.
          </p>
        </div>
      </Section>

      <Section title="About">
        <p className="text-xs leading-relaxed text-ink3">
          TRZ Payroll Manager v2 — payroll for Home Stay Hotel &amp; The Resthouse Zamboanga.
          Installable PWA · data lives in your Supabase project.
        </p>
      </Section>

      <BusinessSheet
        key={editingBiz === 'new' ? 'new' : editingBiz?.id || 'closed'}
        editing={editingBiz}
        onClose={() => setEditingBiz(null)}
        onSave={async (name, id) => {
          try { await saveBusiness(name, id); toast('Business saved'); setEditingBiz(null) }
          catch (e) { toast(e.message, 'error') }
        }}
      />

      <Confirm
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        title="Reset to demo data?"
        message="This deletes ALL businesses, employees, advances and payroll history, then loads the demo dataset. This cannot be undone — back up first if unsure."
        confirmLabel="Reset Everything"
        danger
        onConfirm={async () => {
          setBusy(true)
          try { await resetDemoData(); toast('Demo data restored') }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }}
      />

      <Confirm
        open={!!confirm?.restore}
        onClose={() => setConfirm(null)}
        title="Restore from backup?"
        message="This replaces ALL current data with the contents of the backup file. This cannot be undone."
        confirmLabel="Restore"
        danger
        onConfirm={async () => {
          setBusy(true)
          try { await restoreJSON(confirm.restore); toast('Backup restored') }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }}
      />
    </div>
  )
}

function BenefitRatesSection() {
  const { benefitRates, saveBenefitRates } = useData()
  const toast = useToast()
  const [form, setForm] = useState(() => stringify(benefitRates))
  const [busy, setBusy] = useState(false)
  // Re-sync the form when rates load/refresh (e.g. after reset or restore).
  useEffect(() => { setForm(stringify(benefitRates)) }, [benefitRates])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const dirty = Object.keys(form).some(k => Number(form[k]) !== Number(benefitRates[k]))

  return (
    <Section title="Government Benefits (monthly)">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2 text-[11px] font-medium text-ink3">
          <span />
          <span className="text-center">Employee</span>
          <span className="text-center">Employer</span>
        </div>
        {Object.entries(BENEFITS).map(([key, b]) => (
          <div key={key} className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2">
            <span className="text-xs font-semibold">{b.label}</span>
            <Input type="number" inputMode="decimal" min="0" aria-label={`${b.label} Employee monthly`}
              value={form[`${key}_employee`]} onChange={set(`${key}_employee`)} className="!h-10 text-center" />
            <Input type="number" inputMode="decimal" min="0" aria-label={`${b.label} Employer monthly`}
              value={form[`${key}_employer`]} onChange={set(`${key}_employer`)} className="!h-10 text-center" />
          </div>
        ))}
        <p className="text-[11px] leading-relaxed text-ink3">
          Amounts are per month and are deducted in full on the <span className="text-ink2">2nd cutoff</span> only
          (e.g. SSS Employee {fmtMoney(Number(form.sss_employee) || 0)}/mo comes out of the Jun 16–30 payroll, none on Jun 1–15).
          Changes apply to newly generated and unpaid payroll only; paid entries keep their snapshots.
        </p>
        <Button className="w-full" disabled={!dirty || busy} onClick={async () => {
          setBusy(true)
          try { await saveBenefitRates(form); toast('Benefit rates saved') }
          catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
        }}>
          {busy ? 'Saving…' : 'Save Benefit Rates'}
        </Button>
      </div>
    </Section>
  )
}

function stringify(rates) {
  const out = {}
  for (const [k, v] of Object.entries(rates)) out[k] = String(v)
  return out
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function BusinessSheet({ editing, onClose, onSave }) {
  const isNew = editing === 'new'
  const [name, setName] = useState(isNew ? '' : editing?.name || '')
  const [busy, setBusy] = useState(false)
  if (!editing) return null
  return (
    <Sheet open={!!editing} onClose={onClose} title={isNew ? 'Add Business' : 'Rename Business'}>
      <div className="space-y-3.5">
        <Field label="Business Name">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Home Stay Hotel" />
        </Field>
        <Button className="w-full" disabled={!name.trim() || busy}
          onClick={async () => { setBusy(true); await onSave(name, isNew ? null : editing.id); setBusy(false) }}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Sheet>
  )
}
