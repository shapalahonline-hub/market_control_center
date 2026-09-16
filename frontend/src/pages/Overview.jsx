import { Link } from 'react-router-dom'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  Lightbulb, FileCheck2, CalendarClock, BarChart3, Rocket, Trophy,
  Image, Link2, AlertCircle, Sparkles, ArrowUpRight,
} from 'lucide-react'
import {
  useApi, Card, CardHead, Section, Stat, Chip, PlatformDot,
  Loading, EmptyState, ErrorNote, fmtInt, fmtTenge, cx,
} from '../components/ui.jsx'

// ── chart palette (warm, muted) ──────────────────────────────────────────────
const SLATE = '#7A8B99'
const CLAY = '#D97757'

// icon per needs_you kind (best-effort, falls back to a generic alert)
const NEED_ICON = {
  ideas: Lightbulb,
  idea: Lightbulb,
  drafts: FileCheck2,
  approve: FileCheck2,
  approvals: FileCheck2,
  asset: Image,
  assets: Image,
  schedule: CalendarClock,
  scheduled: CalendarClock,
  measure: BarChart3,
  measuring: BarChart3,
  metrics: BarChart3,
  winners: Trophy,
  winner: Trophy,
  boost: Rocket,
  boosts: Rocket,
  links: Link2,
}
const needIcon = (kind) => NEED_ICON[kind] || NEED_ICON[String(kind || '').toLowerCase()] || AlertCircle

// ── tabular tooltip rendered as a small card ─────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = new Date(label)
  const head = isNaN(d) ? label : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  return (
    <div className="card card-pad !p-3 shadow-card text-xs">
      <div className="text-muted mb-1.5">{head}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular-nums">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-soft">{p.name}</span>
          <span className="ml-auto font-medium text-ink">{fmtInt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

const axisTick = { fontSize: 11, fill: '#8A847C' }
const fmtDay = (s) => {
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}
const fmtCompact = (n) => {
  if (n == null) return ''
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(n)
}

export default function Overview() {
  const { data, loading, error, reload } = useApi('/dashboard')

  if (loading) return <Loading label="Загружаем сводку…" />
  if (error) {
    return (
      <Section title="Обзор">
        <ErrorNote>
          Не удалось загрузить сводку: {error}{' '}
          <button onClick={reload} className="underline underline-offset-2">Повторить</button>
        </ErrorNote>
      </Section>
    )
  }

  const k = data?.kpis || {}
  const series = Array.isArray(data?.series) ? data.series : []
  const needs = Array.isArray(data?.needs_you) ? data.needs_you : []
  const winners = Array.isArray(data?.top_winners) ? data.top_winners : []
  const hasSeries = series.some((d) => (d.views || 0) > 0 || (d.clicks || 0) > 0)

  return (
    <div className="space-y-6">
      <Section
        title="Обзор"
        sub="Пульс контент-машины за последние 30 дней"
      />

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat
          label="Винеры за месяц"
          value={fmtInt(k.winners_month ?? 0)}
          sub="победители недели"
          accent
        />
        <Stat
          label="Посты · 7д / 30д"
          value={`${fmtInt(k.posts_7 ?? 0)} / ${fmtInt(k.posts_30 ?? 0)}`}
          sub="опубликовано"
        />
        <Stat
          label="Просмотры · 30д"
          value={fmtInt(k.views_30 ?? 0)}
        />
        <Stat
          label="Клики по ссылкам · 30д"
          value={fmtInt(k.clicks_30 ?? 0)}
        />
        <Stat
          label="Активные бусты"
          value={fmtInt(k.active_boosts ?? 0)}
          sub={`расход ${fmtTenge(k.spend_mtd ?? 0)} в этом месяце`}
        />
        <Stat
          label="Средний CPC"
          value={k.avg_cpc != null ? fmtTenge(k.avg_cpc) : '—'}
          sub="за клик"
        />
      </div>

      {/* ── Activity chart ───────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title="Активность · 30 дней"
          sub="Просмотры и клики по ссылкам"
          right={
            <div className="flex items-center gap-4 text-xs text-ink-soft">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SLATE }} />
                Просмотры
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLAY }} />
                Клики
              </span>
            </div>
          }
        />
        <div className="px-2 pb-4">
          {hasSeries ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ovViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SLATE} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={SLATE} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ovClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CLAY} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={CLAY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#F0ECE6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDay}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  dy={6}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={fmtCompact}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={fmtCompact}
                  tick={axisTick}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip content={<ChartTip />} cursor={{ stroke: '#E5DFD7', strokeWidth: 1 }} />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="views"
                  name="Просмотры"
                  stroke={SLATE}
                  strokeWidth={1.5}
                  fill="url(#ovViews)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="clicks"
                  name="Клики"
                  stroke={CLAY}
                  strokeWidth={1.5}
                  fill="url(#ovClicks)"
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Пока нет активности"
              hint="Когда посты начнут собирать просмотры и клики, график появится здесь."
            />
          )}
        </div>
      </Card>

      {/* ── Needs you + Top winners ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Требует внимания */}
        <Card>
          <CardHead title="Требует внимания" sub="Что ждёт вашего действия" />
          {needs.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="Всё под контролем"
              hint="Нет задач, требующих вашего внимания прямо сейчас."
            />
          ) : (
            <ul className="px-2 pb-3">
              {needs.map((item, i) => {
                const Icon = needIcon(item.kind)
                return (
                  <li key={item.kind ?? i}>
                    <Link
                      to={item.to || '#'}
                      className={cx(
                        'group flex items-center gap-3 rounded-xl px-3 py-2.5',
                        'hover:bg-surface transition-colors',
                      )}
                    >
                      <span className="w-9 h-9 rounded-xl bg-line-soft flex items-center justify-center shrink-0">
                        <Icon size={17} className="text-ink-soft" />
                      </span>
                      <span className="text-sm text-ink truncate">{item.label}</span>
                      <Chip variant={item.count > 0 ? 'clay' : 'neutral'} className="ml-auto tabular-nums">
                        {fmtInt(item.count ?? 0)}
                      </Chip>
                      <ArrowUpRight
                        size={15}
                        className="text-faint opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Топ-винеры */}
        <Card>
          <CardHead
            title="Топ-винеры"
            sub="Лучшие посты по скору"
            right={
              <Link to="/winners" className="text-xs text-clay-600 hover:text-clay-700 inline-flex items-center gap-1">
                Все винеры <ArrowUpRight size={13} />
              </Link>
            }
          />
          {winners.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="Винеров пока нет"
              hint="Победители появятся после расчёта недельных результатов."
            />
          ) : (
            <ul className="px-2 pb-3">
              {winners.map((w, i) => (
                <li key={w.id ?? i}>
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface transition-colors">
                    <span
                      className={cx(
                        'w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold tabular-nums shrink-0',
                        i === 0 ? 'bg-clay-50 text-clay-700' : 'bg-line-soft text-ink-soft',
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink truncate">{w.product || 'Без названия'}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <PlatformDot platform={w.platform} />
                        {w.caption && (
                          <span className="text-xs text-muted truncate">· {w.caption}</span>
                        )}
                      </div>
                    </div>
                    {w.boosted && <Chip variant="good">Буст</Chip>}
                    <span className="text-sm font-semibold text-ink tabular-nums shrink-0">
                      {typeof w.score === 'number' ? w.score.toFixed(1) : (w.score ?? '—')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
