import { useEffect, useState, useCallback } from 'react'
import clsx from 'clsx'
import { Loader2, Inbox } from 'lucide-react'
import api from '../lib/api'

export const cx = clsx

// ── data hook ───────────────────────────────────────────────────────────────
export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const reload = useCallback(() => {
    setLoading(true)
    api.get(path)
      .then((r) => { setData(r.data); setError(null) })
      .catch((e) => setError(e?.response?.data?.detail || e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  useEffect(() => { reload() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload, setData }
}

// ── surfaces ─────────────────────────────────────────────────────────────────
export function Card({ className, children }) {
  return <div className={cx('card', className)}>{children}</div>
}
export function CardHead({ title, sub, right }) {
  return (
    <div className="flex items-start justify-between px-5 pt-5 pb-3">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Section({ title, sub, right, children }) {
  return (
    <section className="space-y-3">
      {(title || right) && (
        <div className="flex items-end justify-between">
          <div>
            {title && <h2 className="font-display text-lg text-ink">{title}</h2>}
            {sub && <p className="text-sm text-muted">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

// ── KPI / stat ───────────────────────────────────────────────────────────────
export function Stat({ label, value, sub, accent }) {
  return (
    <Card className="card-pad">
      <div className="label">{label}</div>
      <div className={cx('stat-num mt-2 tabular-nums', accent && 'text-clay-600')}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
    </Card>
  )
}

// ── chips / badges ───────────────────────────────────────────────────────────
const CHIP = {
  good: 'bg-good-bg text-good', warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad', info: 'bg-info-bg text-info',
  clay: 'bg-clay-50 text-clay-700', neutral: 'bg-line-soft text-ink-soft',
}
export function Chip({ variant = 'neutral', className, children }) {
  return <span className={cx('chip', CHIP[variant] || CHIP.neutral, className)}>{children}</span>
}

// ── buttons ──────────────────────────────────────────────────────────────────
export function Btn({ variant = 'outline', className, children, ...p }) {
  const v = { primary: 'btn-primary', ghost: 'btn-ghost', outline: 'btn-outline' }[variant]
  return <button className={cx(v, className)} {...p}>{children}</button>
}

// ── states ───────────────────────────────────────────────────────────────────
export function Loading({ label = 'Загрузка…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  )
}
export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-11 h-11 rounded-xl bg-line-soft flex items-center justify-center mb-3">
        <Icon size={20} className="text-faint" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="text-xs text-muted mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
export function ErrorNote({ children }) {
  return <div className="text-sm text-bad bg-bad-bg rounded-xl px-4 py-3">{children}</div>
}

// ── platform + post-state vocab (shared look) ────────────────────────────────
export const PLATFORM = {
  instagram: { label: 'Instagram', short: 'IG', color: '#C2553F' },
  tiktok: { label: 'TikTok', short: 'TT', color: '#262421' },
  youtube: { label: 'YouTube', short: 'YT', color: '#B0473A' },
}
export function PlatformDot({ platform }) {
  const m = PLATFORM[platform] || { color: '#8A847C', short: '?' }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label || platform}
    </span>
  )
}

export const POST_STATE = {
  idea: { label: 'Идея', variant: 'neutral' },
  asset_ready: { label: 'Готов ассет', variant: 'info' },
  approved: { label: 'Одобрено', variant: 'clay' },
  scheduled: { label: 'Запланировано', variant: 'warn' },
  publishing: { label: 'Публикуется', variant: 'info' },
  published: { label: 'Опубликовано', variant: 'good' },
  measuring: { label: 'Замеряем', variant: 'good' },
  failed: { label: 'Ошибка', variant: 'bad' },
  archived: { label: 'Архив', variant: 'neutral' },
}

// number helpers re-exported for pages
export { fmtInt, fmtTenge, fmtPct } from '../lib/api'
export { api }
