import { useMemo } from 'react'
import { useData } from '../context/DataContext'
import { summarize, monthName, CUTOFFS } from '../lib/payroll'
import { fmtMoney } from '../lib/format'
import PeriodPicker from '../components/PeriodPicker'
import { Badge, Button } from '../components/ui'

export default function Dashboard({ period, setPeriod, goTo, theme, onToggleTheme }) {
  const { employees, periods, entries } = useData()

  const activePeriod = periods.find(p =>
    p.year === period.year && p.month === period.month && p.cutoff === period.cutoff)

  const scoped = useMemo(() => {
    if (!activePeriod) return []
    return entries.filter(e => e.period_id === activePeriod.id &&
      (!period.businessId || e.business_id === period.businessId))
  }, [entries, activePeriod, period.businessId])

  const s = summarize(scoped)
  const activeEmployees = employees.filter(e =>
    e.status === 'active' && (!period.businessId || e.business_id === period.businessId)).length

  const hasPayroll = scoped.length > 0
  const allPaid = hasPayroll && s.remainingPayable === 0
  const unpaidCount = scoped.length - s.paidCount
  const paidPct = hasPayroll ? Math.round((s.paidCount / scoped.length) * 100) : 0

  const recent = useMemo(() => periods.slice(0, 4).map(p => {
    const pe = entries.filter(e => e.period_id === p.id)
    const ps = summarize(pe)
    return { ...p, summary: ps, done: pe.length > 0 && ps.remainingPayable === 0 }
  }).filter(p => p.summary.entryCount > 0), [periods, entries])

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink3">{monthName(period.month)} {period.year} · {CUTOFFS[period.cutoff].label}</p>
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>
        <button onClick={onToggleTheme} aria-label="Toggle dark mode"
          className="press grid h-10 w-10 place-items-center rounded-full border border-line/60 bg-card text-ink2 hover:text-ink">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <PeriodPicker period={period} onChange={setPeriod} />

      {/* Hero: the one number that matters */}
      <section className="anim-pop relative overflow-hidden rounded-[28px] border border-line/40 bg-hero p-6 backdrop-blur">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/10" />
        <div className="absolute -right-2 top-14 h-16 w-16 rounded-full bg-accent/10" />

        <div className="relative flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink2">Remaining Payable</p>
          <Badge kind={!hasPayroll ? 'muted' : allPaid ? 'ok' : 'warn'}>
            {!hasPayroll ? 'Not Generated' : allPaid ? 'Completed' : 'In Progress'}
          </Badge>
        </div>
        <p className={`relative mt-2 text-[2.75rem] font-bold leading-none tracking-tight ${allPaid ? 'text-accent' : ''}`}>
          {fmtMoney(s.remainingPayable)}
        </p>

        {hasPayroll ? (
          <div className="relative mt-5 space-y-2.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-line/50">
              <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${paidPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <p className="text-ink2">
                <span className="font-semibold text-accent">{s.paidCount} paid</span>
                <span className="text-ink3"> · </span>
                <span className={`font-semibold ${unpaidCount ? 'text-danger' : 'text-ink3'}`}>{unpaidCount} unpaid</span>
              </p>
              <p className="text-ink3">{activeEmployees} active employees</p>
            </div>
          </div>
        ) : (
          <div className="relative mt-5 flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-ink2">
              No payroll for this cutoff yet · {activeEmployees} active employees
            </p>
            <Button className="!h-9 shrink-0 !rounded-full !px-4 !text-xs" onClick={() => goTo('payroll')}>
              Generate
            </Button>
          </div>
        )}
      </section>

      {/* Only the metrics that drive decisions */}
      <section className="grid grid-cols-2 gap-3">
        <Stat label="Gross Payroll" value={fmtMoney(s.grossPayroll)} onClick={() => goTo('payroll')} />
        <Stat label="Cash Advances" value={fmtMoney(s.cashAdvancesDeducted)} danger={s.cashAdvancesDeducted > 0} onClick={() => goTo('advances')} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent Payrolls</h2>
          <button onClick={() => goTo('reports')} className="press rounded-lg px-1.5 py-0.5 text-xs font-medium text-accent">View All</button>
        </div>
        <div className="space-y-2">
          {recent.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line py-6 text-center text-xs text-ink3">
              Generated payrolls will appear here.
            </p>
          )}
          {recent.map(p => (
            <button key={p.id} onClick={() => { setPeriod({ ...period, year: p.year, month: p.month, cutoff: p.cutoff }); goTo('payroll') }}
              className="press flex w-full items-center justify-between rounded-2xl border border-line/60 bg-card p-4 text-left transition hover:border-ink3">
              <div>
                <p className="text-sm font-semibold">{monthName(p.month)} {p.year} · {CUTOFFS[p.cutoff].label}</p>
                <p className="mt-0.5 text-xs text-ink3">Net {fmtMoney(p.summary.netPayroll)} · {p.summary.entryCount} employees</p>
              </div>
              <Badge kind={p.done ? 'ok' : 'warn'}>{p.done ? 'Completed' : 'In Progress'}</Badge>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, danger = false, onClick }) {
  return (
    <button onClick={onClick}
      className="press rounded-2xl border border-line/60 bg-card p-4 text-left transition hover:border-ink3">
      <p className="text-[11px] font-medium text-ink3">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold tracking-tight ${danger ? 'text-danger' : ''}`}>{value}</p>
    </button>
  )
}

const ic = { strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none', stroke: 'currentColor' }

function MoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ic}><path d="M20.2 14.5A8.2 8.2 0 0 1 9.5 3.8a8.2 8.2 0 1 0 10.7 10.7z"/></svg>
}
function SunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" {...ic}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/></svg>
}
