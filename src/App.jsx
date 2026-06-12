import { Component, useEffect, useState } from 'react'
import { isConfigured } from './lib/supabase'
import { DataProvider, useData } from './context/DataContext'
import { ToastProvider, Button } from './components/ui'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Payroll from './pages/Payroll'
import CashAdvances from './pages/CashAdvances'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import SetupGuide from './pages/SetupGuide'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: HomeIcon },
  { id: 'employees', label: 'Employees', icon: PeopleIcon },
  { id: 'payroll', label: 'Payroll', icon: PesoIcon },
  { id: 'advances', label: 'Advances', icon: CardIcon },
  { id: 'reports', label: 'Reports', icon: DocIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon },
]

function currentDefaultPeriod() {
  const now = new Date()
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    cutoff: now.getDate() <= 15 ? 1 : 2,
    businessId: null,
  }
}

export default function App() {
  if (!isConfigured) return <SetupGuide />
  return (
    <ErrorBoundary>
      <ToastProvider>
        <DataProvider>
          <Shell />
        </DataProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
        <div className="w-full rounded-2xl border border-danger/30 bg-card p-6 text-center">
          <p className="text-sm font-semibold text-danger">Something went wrong</p>
          <p className="mt-2 break-words text-xs leading-relaxed text-ink2">{String(this.state.error?.message || this.state.error)}</p>
          <Button className="mt-4 w-full" onClick={() => window.location.reload()}>Reload App</Button>
        </div>
      </div>
    )
  }
}

function Shell() {
  const { loading, error, loadAll } = useData()
  const [tab, setTab] = useState('dashboard')
  const [period, setPeriod] = useState(currentDefaultPeriod)
  const [theme, setTheme] = useState(() => localStorage.getItem('pm-theme') || 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('pm-theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e1114' : '#f7fbff')
  }, [theme])
  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  if (error) {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
        <div className="w-full rounded-2xl border border-danger/30 bg-card p-6 text-center">
          <p className="text-sm font-semibold text-danger">Could not load data</p>
          <p className="mt-2 break-words text-xs leading-relaxed text-ink2">{error}</p>
          <p className="mt-2 text-xs text-ink3">
            Check your Supabase URL/key in <code>.env</code> and that migrations have been applied.
          </p>
          <Button className="mt-4 w-full" onClick={loadAll}>Retry</Button>
        </div>
      </div>
    )
  }

  const pages = {
    dashboard: <Dashboard period={period} setPeriod={setPeriod} goTo={setTab} theme={theme} onToggleTheme={toggleTheme} />,
    employees: <Employees />,
    payroll: <Payroll period={period} setPeriod={setPeriod} />,
    advances: <CashAdvances period={period} />,
    reports: <Reports goTo={setTab} />,
    settings: <Settings />,
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24 sm:max-w-2xl lg:max-w-4xl">
      {loading
        ? <PageSkeleton />
        : <main key={tab} className="anim-page px-4 pt-4 sm:px-6">{pages[tab]}</main>}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-surface/80 backdrop-blur-xl shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 sm:max-w-2xl lg:max-w-4xl">
          {TABS.map(t => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium transition ${
                  active ? 'text-accent' : 'text-ink3 hover:text-ink2'}`}>
                <Icon active={active} />
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// Shimmer skeleton shown while first data load is in flight.
function PageSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-4 sm:px-6">
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-36 rounded-lg" />
        <div className="skeleton h-10 w-10 rounded-full" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map(i => <div key={i} className="skeleton h-9 w-24 rounded-full" />)}
      </div>
      <div className="skeleton h-48 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
      </div>
      {[0, 1, 2].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
    </div>
  )
}

const sw = { strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none', stroke: 'currentColor' }

function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...sw}><path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5"/></svg>
}
function PeopleIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...sw}><circle cx="9" cy="8" r="3.2"/><path d="M2.8 20c.6-3.3 3.1-5 6.2-5s5.6 1.7 6.2 5M16 5.3a3.2 3.2 0 0 1 0 5.4M18.5 15.4c1.5.7 2.5 2 2.7 4.1"/></svg>
}
function PesoIcon({ active }) {
  return (
    <span className={`grid h-6 w-6 place-items-center rounded-lg text-[13px] font-bold ${active ? 'bg-accent text-white' : ''}`}>
      ₱
    </span>
  )
}
function CardIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...sw}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19M6 14.5h4"/></svg>
}
function DocIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...sw}><path d="M6 2.8h8.5L19 7.3V21H6zM14 3v5h5M9 12h6M9 16h6"/></svg>
}
function GearIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" {...sw}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M4.1 7.4l2.1 1.2M17.8 15.4l2.1 1.2M4.1 16.6l2.1-1.2M17.8 8.6l2.1-1.2"/></svg>
}
