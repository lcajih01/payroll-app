import { Select } from './ui'
import { monthName, CUTOFFS } from '../lib/payroll'
import { useData } from '../context/DataContext'

const YEARS = (() => {
  const now = new Date().getFullYear()
  const ys = []
  for (let y = now - 3; y <= now + 1; y++) ys.push(y)
  return ys
})()

export default function PeriodPicker({ period, onChange, showBusiness = true }) {
  const { businesses } = useData()
  const set = (patch) => onChange({ ...period, ...patch })
  return (
    <div className="no-print flex gap-2 overflow-x-auto pb-0.5">
      <Select aria-label="Month" value={period.month} onChange={e => set({ month: Number(e.target.value) })}
        className="!h-9 !w-auto min-w-[7.2rem] !rounded-full !bg-card !text-xs font-semibold">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <option key={m} value={m}>{monthName(m)} {period.year}</option>
        ))}
      </Select>
      <Select aria-label="Year" value={period.year} onChange={e => set({ year: Number(e.target.value) })}
        className="!h-9 !w-auto !rounded-full !bg-card !text-xs font-semibold">
        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
      </Select>
      <Select aria-label="Cutoff" value={period.cutoff} onChange={e => set({ cutoff: Number(e.target.value) })}
        className="!h-9 !w-auto !rounded-full !bg-card !text-xs font-semibold">
        {[1, 2].map(c => <option key={c} value={c}>{CUTOFFS[c].label}</option>)}
      </Select>
      {showBusiness && (
        <Select aria-label="Business" value={period.businessId || ''} onChange={e => set({ businessId: e.target.value || null })}
          className="!h-9 !w-auto !rounded-full !bg-card !text-xs font-semibold">
          <option value="">All Businesses</option>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
      )}
    </div>
  )
}
