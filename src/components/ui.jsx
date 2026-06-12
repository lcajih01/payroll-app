import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { initials } from '../lib/format'

// ---------- Toasts ----------

const ToastContext = createContext(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, message, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="no-print fixed left-1/2 top-3 z-[80] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id}
            className={`anim-pop flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-xl backdrop-blur ${
              t.kind === 'error'
                ? 'border-danger/40 bg-danger-dim/95 text-danger'
                : 'border-accent/30 bg-surface/95 text-ink'
            }`}>
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${
              t.kind === 'error' ? 'bg-danger' : 'bg-accent'}`}>
              {t.kind === 'error' ? '!' : '✓'}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------- Bottom sheet / dialog ----------

export function Sheet({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="anim-fade scrim absolute inset-0 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`anim-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border-t border-line/60 bg-surface/90 backdrop-blur-xl sm:max-h-[85dvh] sm:rounded-3xl sm:border ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full bg-card2 text-ink2 hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          {children}
        </div>
      </div>
    </div>
  )
}

export function Confirm({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-relaxed text-ink2">{message}</p>
      <div className="mt-5 flex gap-3">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="flex-1"
          onClick={() => { onConfirm(); onClose() }}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

// ---------- Buttons ----------

export function Button({ variant = 'primary', className = '', disabled, children, ...props }) {
  const styles = {
    primary: 'bg-accent text-white hover:brightness-110 active:brightness-95 font-semibold',
    danger: 'bg-danger text-white hover:brightness-110 font-semibold',
    dangerSoft: 'bg-danger-dim text-danger border border-danger/30 hover:brightness-125 font-medium',
    ghost: 'bg-card2 text-ink border border-line hover:border-ink3 font-medium',
    soft: 'bg-accent-dim text-accent border border-accent/25 hover:brightness-125 font-semibold',
  }
  return (
    <button disabled={disabled} {...props}
      className={`press flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm transition disabled:opacity-40 ${styles[variant]} ${className}`}>
      {children}
    </button>
  )
}

// ---------- Form fields ----------

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink3">{hint}</span>}
    </label>
  )
}

const inputCls = 'h-11 w-full rounded-xl border border-line bg-card2 px-3.5 text-sm text-ink placeholder:text-ink3 outline-none transition focus:border-accent/60'

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />
}

export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputCls} appearance-none ${props.className || ''}`}>
      {children}
    </select>
  )
}

export function Textarea(props) {
  return <textarea rows={2} {...props} className={`${inputCls} h-auto py-2.5 ${props.className || ''}`} />
}

// Checkbox rendered as a tappable pill (mobile-friendly toggle).
export function CheckPill({ checked, onChange, children }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-semibold transition ${
        checked
          ? 'border-accent/50 bg-accent-dim text-accent'
          : 'border-line bg-card2 text-ink3 hover:text-ink2'}`}>
      <span className={`grid h-4 w-4 place-items-center rounded border ${
        checked ? 'border-accent bg-accent text-white' : 'border-ink3'}`}>
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5.5 4 8l4.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </span>
      {children}
    </button>
  )
}

// ---------- Display ----------

export function Avatar({ name, archived = false }) {
  return (
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold ${
      archived ? 'bg-card2 text-ink3' : 'bg-accent-deep text-accent'}`}>
      {initials(name)}
    </div>
  )
}

export function Badge({ kind = 'ok', children }) {
  const styles = {
    ok: 'bg-accent-dim text-accent',
    danger: 'bg-danger-dim text-danger',
    warn: 'bg-warn-dim text-warn',
    muted: 'bg-card2 text-ink3',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[kind]}`}>
      {children}
    </span>
  )
}

export function SegmentedTabs({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl bg-card2/80 p-1">
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`press h-9 flex-1 rounded-lg text-xs font-semibold transition ${
            value === t.value ? 'bg-surface text-ink shadow' : 'text-ink3 hover:text-ink2'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon = '🗂️', title, hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line py-12 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-[260px] text-xs leading-relaxed text-ink3">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="grid min-h-[40dvh] place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}
