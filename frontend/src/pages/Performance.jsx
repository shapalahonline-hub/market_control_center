import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3, Trophy, ArrowUp, ArrowDown, ExternalLink, Sparkles, Rocket,
} from 'lucide-react'
import {
  Section, Card, Stat, Chip, Loading, EmptyState, ErrorNote,
  PlatformDot, PLATFORM, useApi, fmtInt, fmtPct, cx,
} from '../components/ui.jsx'

// ── platform tabs ─────────────────────────────────────────────────────────────
const TABS = ['instagram', 'tiktok', 'youtube']

// ── sortable columns (key resolves a number from the row for sorting) ──────────
const COLS = [
  { key: 'product', label: 'Товар', align: 'left' },
  { key: 'views', label: 'Просмотры', num: (p) => p.latest?.views },
  { key: 'likes', label: 'Лайки', num: (p) => p.latest?.likes },
  { key: 'saves', label: 'Сохранения', num: (p) => p.latest?.saves },
  { key: 'shares', label: 'Репосты', num: (p) => p.latest?.shares },
  { key: 'clicks', label: 'Клики', num: (p) => p.latest?.link_clicks },
  { key: 'watch', label: 'Досмотр %', num: (p) => p.latest?.avg_watch_pct },
  { key: 'age', label: 'Возраст', num: (p) => ageDays(p.published_at) },
]

function ageDays(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}
function ageLabel(iso) {
  const d = ageDays(iso)
  if (d == null) return '—'
  if (d === 0) return 'сегодня'
  return `${fmtInt(d)} дн.`
}
const sum = (rows, pick) => rows.reduce((a, r) => a + (Number(pick(r)) || 0), 0)

export default function Performance() {
  const { data, loading, error, reload } = useApi('/posts?state=measuring')
  const [tab, setTab] = useState('instagram')
  const [sort, setSort] = useState({ key: 'views', dir: 'desc' })

  const posts = Array.isArray(data) ? data : []

  // counts per platform for tab badges
  const counts = useMemo(() => {
    const c = { instagram: 0, tiktok: 0, youtube: 0 }
    for (const p of posts) if (c[p.platform] != null) c[p.platform]++
    return c
  }, [posts])

  const rows = useMemo(() => posts.filter((p) => p.platform === tab), [posts, tab])

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key)
    const mul = sort.dir === 'asc' ? 1 : -1
    const arr = [...rows]
    arr.sort((a, b) => {
      if (sort.key === 'product') {
        const av = (a.product_title || '').toLowerCase()
        const bv = (b.product_title || '').toLowerCase()
        return av.localeCompare(bv, 'ru') * mul
      }
      const av = col?.num?.(a)
      const bv = col?.num?.(b)
      // nulls always sink to the bottom regardless of direction
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return (av - bv) * mul
    })
    return arr
  }, [rows, sort])

  // platform KPIs + leaderboard (top post by views)
  const kpis = useMemo(() => ({
    views: sum(rows, (r) => r.latest?.views),
    clicks: sum(rows, (r) => r.latest?.link_clicks),
    watch: (() => {
      const vals = rows.map((r) => r.latest?.avg_watch_pct).filter((v) => v != null)
      if (!vals.length) return null
      return vals.reduce((a, v) => a + Number(v), 0) / vals.length
    })(),
  }), [rows])

  const leader = useMemo(() => {
    let best = null
    for (const r of rows) {
      const v = r.latest?.views ?? -1
      if (!best || v > (best.latest?.views ?? -1)) best = r
    }
    return best
  }, [rows])

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' }
        // text defaults ascending, numbers descending
        : { key, dir: key === 'product' ? 'asc' : 'desc' },
    )
  }

  const pm = PLATFORM[tab]

  return (
    <Section
      title="Эффективность"
      sub="Метрики опубликованных постов на замере — по площадкам"
      right={
        <div className="flex items-center gap-2 text-xs text-muted">
          <BarChart3 size={14} /> Всего на замере: <span className="tabular-nums text-ink-soft">{fmtInt(posts.length)}</span>
        </div>
      }
    >
      {/* platform tabs */}
      <div className="flex items-center gap-1.5">
        {TABS.map((p) => {
          const active = tab === p
          return (
            <button
              key={p}
              onClick={() => setTab(p)}
              className={cx(
                'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-surface border border-line text-ink shadow-card'
                  : 'border border-transparent text-ink-soft hover:bg-line-soft',
              )}
            >
              <PlatformDot platform={p} />
              <span
                className={cx(
                  'tabular-nums text-xs rounded-full px-1.5 py-0.5',
                  active ? 'bg-clay-50 text-clay-700' : 'bg-line-soft text-muted',
                )}
              >
                {counts[p]}
              </span>
            </button>
          )
        })}
      </div>

      {loading && <Card className="card-pad"><Loading /></Card>}
      {error && <ErrorNote>Не удалось загрузить метрики: {error}</ErrorNote>}

      {!loading && !error && (
        rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="Нет постов на замере"
              hint={`Для площадки ${pm?.label || tab} пока нет опубликованных постов с метриками.`}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* platform KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="Всего просмотров" value={fmtInt(kpis.views)} accent
                sub={`${fmtInt(rows.length)} ${pluralPost(rows.length)}`} />
              <Stat label="Переходов по ссылке" value={fmtInt(kpis.clicks)}
                sub="суммарно по площадке" />
              <Stat label="Средний досмотр" value={fmtPct(kpis.watch)}
                sub="среднее по постам с метрикой" />
            </div>

            {/* leaderboard */}
            {leader && <Leaderboard post={leader} platform={tab} />}

            {/* table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      {COLS.map((c) => {
                        const active = sort.key === c.key
                        const right = c.align !== 'left'
                        return (
                          <th
                            key={c.key}
                            className={cx(
                              'label py-3 px-4 select-none cursor-pointer whitespace-nowrap',
                              right ? 'text-right' : 'text-left',
                              active && 'text-clay-600',
                            )}
                            onClick={() => toggleSort(c.key)}
                          >
                            <span className={cx('inline-flex items-center gap-1', right && 'flex-row-reverse')}>
                              {c.label}
                              {active && (
                                sort.dir === 'desc'
                                  ? <ArrowDown size={11} />
                                  : <ArrowUp size={11} />
                              )}
                            </span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p) => {
                      const m = p.latest
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-line-soft last:border-0 hover:bg-clay-50 transition-colors"
                        >
                          <td className="py-3 px-4 max-w-[260px]">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-ink font-medium" title={p.product_title}>
                                {p.product_title || '—'}
                              </span>
                              {p.is_boosted && <Chip variant="clay"><Rocket size={11} /> буст</Chip>}
                            </div>
                            {p.permalink && (
                              <a
                                href={p.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-muted hover:text-clay-600 mt-0.5"
                              >
                                открыть <ExternalLink size={11} />
                              </a>
                            )}
                          </td>
                          <Num v={m?.views} />
                          <Num v={m?.likes} />
                          <Num v={m?.saves} />
                          <Num v={m?.shares} />
                          <Num v={m?.link_clicks} strong />
                          <td className="py-3 px-4 text-right tabular-nums text-ink-soft whitespace-nowrap">
                            {m?.avg_watch_pct == null ? <span className="text-faint">—</span> : fmtPct(m.avg_watch_pct)}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-muted whitespace-nowrap">
                            {ageLabel(p.published_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )
      )}
    </Section>
  )
}

// ── numeric cell ───────────────────────────────────────────────────────────────
function Num({ v, strong }) {
  return (
    <td className={cx(
      'py-3 px-4 text-right tabular-nums whitespace-nowrap',
      strong ? 'text-ink font-medium' : 'text-ink-soft',
    )}>
      {v == null ? <span className="text-faint">—</span> : fmtInt(v)}
    </td>
  )
}

// ── leaderboard card for the platform's top post ──────────────────────────────
function Leaderboard({ post, platform }) {
  const m = post.latest || {}
  const color = PLATFORM[platform]?.color || '#D97757'
  return (
    <Card className="card-pad overflow-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-lg"
              style={{ background: 'rgba(217,119,87,0.12)' }}
            >
              <Trophy size={13} className="text-clay-600" />
            </span>
            <span className="label">Лидер площадки</span>
            <PlatformDot platform={platform} />
          </div>
          <h3 className="font-display text-lg text-ink truncate" title={post.product_title}>
            {post.product_title || 'Без названия'}
          </h3>
          {(post.caption_final) && (
            <p className="text-sm text-muted mt-1 line-clamp-2 max-w-xl">{post.caption_final}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {post.is_boosted
              ? <Chip variant="clay"><Rocket size={11} /> в продвижении</Chip>
              : <Chip variant="info"><Sparkles size={11} /> кандидат на буст</Chip>}
            <Link to="/winners" className="text-xs text-muted hover:text-clay-600 inline-flex items-center gap-1">
              к победителям <ExternalLink size={11} />
            </Link>
          </div>
        </div>

        <div className="flex items-stretch gap-5 shrink-0">
          <LeaderMetric label="Просмотры" value={fmtInt(m.views)} accent />
          <div className="w-px bg-line-soft" />
          <LeaderMetric label="Клики" value={fmtInt(m.link_clicks)} />
          <div className="w-px bg-line-soft" />
          <LeaderMetric label="Досмотр" value={fmtPct(m.avg_watch_pct)} />
        </div>
      </div>
      <div className="h-1 rounded-full mt-4 opacity-70" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
    </Card>
  )
}

function LeaderMetric({ label, value, accent }) {
  return (
    <div className="text-right">
      <div className="label">{label}</div>
      <div className={cx('font-display text-2xl leading-none mt-1.5 tabular-nums', accent ? 'text-clay-600' : 'text-ink')}>
        {value}
      </div>
    </div>
  )
}

function pluralPost(n) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return 'постов'
  if (b > 1 && b < 5) return 'поста'
  if (b === 1) return 'пост'
  return 'постов'
}
