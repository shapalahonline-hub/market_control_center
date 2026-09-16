import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays, RotateCcw } from 'lucide-react'
import {
  useApi, Card, Section, Btn, Chip, Loading, ErrorNote, EmptyState,
  PLATFORM, cx,
} from '../components/ui.jsx'

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// Local YYYY-MM-DD key (avoid UTC shift from toISOString)
function dayKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parse a post's effective calendar date from scheduled_for / published_at
function postDayKey(p) {
  const raw = p.scheduled_for || p.published_at
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    // Fallback: take the date portion of an ISO-ish string
    return String(raw).slice(0, 10)
  }
  return dayKey(d)
}

function shortProduct(title) {
  if (!title) return 'Без товара'
  const t = title.trim()
  return t.length > 16 ? t.slice(0, 15) + '…' : t
}

// Build the 6×7 grid (Mon-first) covering the given month
function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // 0=Mon
  const start = new Date(year, month, 1 - startOffset)
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    cells.push(d)
  }
  return cells
}

export default function Calendar() {
  const { data: posts, loading, error, reload } = useApi('/posts', [])
  const { data: settings } = useApi('/settings', [])

  const today = new Date()
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })

  const caps = settings?.cadence_caps || {}
  const todayKey = dayKey(today)

  // Map dayKey -> array of posts on that day
  const byDay = useMemo(() => {
    const map = {}
    if (!Array.isArray(posts)) return map
    for (const p of posts) {
      const k = postDayKey(p)
      if (!k) continue
      ;(map[k] ||= []).push(p)
    }
    return map
  }, [posts])

  const cells = useMemo(() => buildGrid(cursor.y, cursor.m), [cursor])

  const scheduledCount = useMemo(() => {
    if (!Array.isArray(posts)) return 0
    return posts.filter((p) => postDayKey(p)).length
  }, [posts])

  const goPrev = () =>
    setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }))
  const goNext = () =>
    setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }))
  const goToday = () => setCursor({ y: today.getFullYear(), m: today.getMonth() })

  const isCurrentMonth =
    cursor.y === today.getFullYear() && cursor.m === today.getMonth()

  const legend = (
    <div className="flex flex-wrap items-center gap-3">
      {Object.entries(PLATFORM).map(([key, m]) => (
        <span key={key} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
          <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
          {m.label}
        </span>
      ))}
    </div>
  )

  return (
    <Section
      title="Календарь контента"
      sub="Запланированные и опубликованные посты по дням"
      right={legend}
    >
      {/* Month header / navigation */}
      <Card className="card-pad">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl text-ink tabular-nums">
              {MONTHS[cursor.m]} {cursor.y}
            </h2>
            {!isCurrentMonth && (
              <Btn variant="ghost" onClick={goToday} className="text-xs">
                <RotateCcw size={13} className="mr-1" /> Сегодня
              </Btn>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted mr-1 tabular-nums">
              {scheduledCount} в плане
            </span>
            <Btn variant="ghost" onClick={goPrev} aria-label="Предыдущий месяц">
              <ChevronLeft size={16} />
            </Btn>
            <Btn variant="ghost" onClick={goNext} aria-label="Следующий месяц">
              <ChevronRight size={16} />
            </Btn>
          </div>
        </div>

        {error ? (
          <div className="mt-4">
            <ErrorNote>
              Не удалось загрузить посты: {error}{' '}
              <button onClick={reload} className="underline">Повторить</button>
            </ErrorNote>
          </div>
        ) : loading ? (
          <Loading label="Загрузка календаря…" />
        ) : (
          <>
            {/* Weekday header */}
            <div className="grid grid-cols-7 mt-5 mb-2">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-[11px] font-medium text-faint uppercase tracking-wide px-1">
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px bg-line-soft rounded-xl overflow-hidden border border-line-soft">
              {cells.map((d) => {
                const k = dayKey(d)
                const inMonth = d.getMonth() === cursor.m
                const isToday = k === todayKey
                const dayPosts = byDay[k] || []

                // Per-platform overflow vs cadence cap
                const platCounts = {}
                for (const p of dayPosts) {
                  platCounts[p.platform] = (platCounts[p.platform] || 0) + 1
                }
                const overflowed = Object.entries(platCounts).some(
                  ([plat, cnt]) => caps[plat] != null && cnt > caps[plat]
                )

                return (
                  <div
                    key={k}
                    className={cx(
                      'min-h-[104px] bg-surface px-1.5 pt-1.5 pb-2 flex flex-col',
                      !inMonth && 'bg-paper'
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={cx(
                          'inline-flex items-center justify-center text-xs tabular-nums w-6 h-6 rounded-full',
                          inMonth ? 'text-ink-soft' : 'text-faint',
                          isToday && 'bg-clay-50 text-clay-700 font-semibold ring-1 ring-clay-500'
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {overflowed && (
                        <Chip variant="warn" className="!px-1.5 !py-0 text-[10px]">
                          перебор
                        </Chip>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayPosts.slice(0, 4).map((p) => {
                        const m = PLATFORM[p.platform] || { color: '#8A847C' }
                        const muted = p.state === 'failed' || p.state === 'archived'
                        return (
                          <Link
                            key={p.id}
                            to={`/posts/${p.id}`}
                            title={`${m.label || p.platform} · ${p.product_title || 'без товара'}`}
                            className={cx(
                              'group flex items-center gap-1.5 rounded-md px-1.5 py-0.5',
                              'bg-raised hover:bg-line-soft transition-colors',
                              muted && 'opacity-50'
                            )}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: m.color }}
                            />
                            <span className="text-[11px] text-ink-soft truncate leading-tight">
                              {shortProduct(p.product_title)}
                            </span>
                          </Link>
                        )
                      })}
                      {dayPosts.length > 4 && (
                        <span className="text-[10px] text-faint px-1.5">
                          +{dayPosts.length - 4} ещё
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Empty-month note (grid still rendered above) */}
            {scheduledCount === 0 && (
              <div className="mt-4">
                <EmptyState
                  icon={CalendarDays}
                  title="Нет запланированных постов"
                  hint="Запланируйте посты в канбане — они появятся здесь на своих датах."
                  action={
                    <Link to="/posts">
                      <Btn variant="outline">Открыть посты</Btn>
                    </Link>
                  }
                />
              </div>
            )}
          </>
        )}
      </Card>
    </Section>
  )
}
