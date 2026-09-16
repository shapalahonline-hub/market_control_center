import { useMemo, useState } from 'react'
import {
  Megaphone, Play, Pause, TrendingUp, RefreshCw, Rocket, Info,
} from 'lucide-react'
import {
  ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, Bar, Line, CartesianGrid,
} from 'recharts'
import {
  useApi, api, Card, CardHead, Section, Stat, Chip, Btn,
  Loading, EmptyState, ErrorNote, PlatformDot,
  fmtInt, fmtTenge, cx,
} from '../components/ui.jsx'

const CLAY = '#D97757'
const SLATE = '#7A8B99'
const GRID = '#F0ECE6'

// pull a spend number off an insight/campaign row (live or stored shapes vary)
const rowSpend = (r) => Number(r?.spend ?? r?.spend_kzt ?? 0) || 0
const rowCpc = (r) => {
  const v = r?.cpc ?? r?.cpc_kzt
  return v == null ? null : Number(v) || 0
}
const rowClicks = (r) => Number(r?.clicks ?? 0) || 0
const rowImpr = (r) => Number(r?.impressions ?? 0) || 0

function fmtDay(d) {
  if (!d) return '—'
  const s = String(d).slice(0, 10)
  const [, m, day] = s.split('-')
  return m && day ? `${day}.${m}` : s
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const spend = payload.find((p) => p.dataKey === 'spend')?.value
  const cpc = payload.find((p) => p.dataKey === 'cpc')?.value
  return (
    <div className="card card-pad !p-3 shadow-card text-xs">
      <div className="font-medium text-ink mb-1">{fmtDay(label)}</div>
      <div className="flex items-center gap-2 text-ink-soft">
        <span className="w-2 h-2 rounded-sm" style={{ background: CLAY }} />
        Расход: <span className="tabular-nums text-ink">{fmtTenge(spend || 0)}</span>
      </div>
      <div className="flex items-center gap-2 text-ink-soft mt-0.5">
        <span className="w-2 h-2 rounded-sm" style={{ background: SLATE }} />
        CPC: <span className="tabular-nums text-ink">{cpc == null ? '—' : fmtTenge(cpc)}</span>
      </div>
    </div>
  )
}

export default function Ads() {
  const campaignsApi = useApi('/ads/campaigns')
  const insightsApi = useApi('/ads/insights?date_preset=last_7d')
  const [busy, setBusy] = useState(null) // campaign id currently mutating

  const insightRows = useMemo(() => {
    const rows = insightsApi.data?.rows
    if (!Array.isArray(rows)) return []
    return rows
      .map((r) => ({
        date: String(r.date_start || '').slice(0, 10),
        spend: rowSpend(r),
        cpc: rowCpc(r),
        clicks: rowClicks(r),
        impressions: rowImpr(r),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [insightsApi.data])

  const kpis = useMemo(() => {
    const spend = insightRows.reduce((s, r) => s + r.spend, 0)
    const clicks = insightRows.reduce((s, r) => s + r.clicks, 0)
    const impressions = insightRows.reduce((s, r) => s + r.impressions, 0)
    return {
      spend,
      impressions,
      clicks,
      costPerClick: clicks > 0 ? spend / clicks : null,
    }
  }, [insightRows])

  async function mutate(id, action) {
    if (action === 'activate') {
      const ok = window.confirm(
        'Запустить кампанию? Это тратит реальные деньги по дневному бюджету. Продолжить?',
      )
      if (!ok) return
    }
    setBusy(id)
    try {
      await api.post(`/ads/campaigns/${id}/${action}`)
      await campaignsApi.reload()
      insightsApi.reload()
    } catch (e) {
      window.alert(e?.response?.data?.detail || e.message || 'Не удалось выполнить действие')
    } finally {
      setBusy(null)
    }
  }

  const campaigns = Array.isArray(campaignsApi.data) ? campaignsApi.data : []
  const insightsSource = insightsApi.data?.source

  return (
    <div className="space-y-6">
      <Section
        title="Реклама / ROAS"
        sub="Платный буст винеров. За 7 дней."
        right={
          <Btn
            variant="ghost"
            onClick={() => { campaignsApi.reload(); insightsApi.reload() }}
            className="gap-1.5"
          >
            <RefreshCw size={14} /> Обновить
          </Btn>
        }
      >
        {/* ── KPI row ─────────────────────────────────────────── */}
        {insightsApi.error ? (
          <ErrorNote>Не удалось загрузить статистику: {insightsApi.error}</ErrorNote>
        ) : insightsApi.loading ? (
          <Card className="card-pad"><Loading /></Card>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="Расход (период)"
              value={fmtTenge(kpis.spend)}
              sub={insightsSource === 'live' ? 'live · из рекламного кабинета' : 'из сохранённых данных'}
            />
            <Stat
              label="Cost per link-click"
              value={kpis.costPerClick == null ? '—' : fmtTenge(kpis.costPerClick)}
              sub="реальная метрика эффективности"
              accent
            />
            <Stat
              label="Показы"
              value={fmtInt(kpis.impressions)}
              sub={`${fmtInt(kpis.clicks)} кликов`}
            />
            <Stat
              label="ROAS"
              value="—"
              sub="прокси · продажа off-domain"
            />
          </div>
        )}
      </Section>

      {/* ── Chart ───────────────────────────────────────────────── */}
      <Card>
        <CardHead
          title="Расход и CPC по дням"
          sub="Столбцы — дневной расход, линия — стоимость клика"
          right={
            insightsSource && (
              <Chip variant={insightsSource === 'live' ? 'good' : insightsSource === 'error' ? 'bad' : 'neutral'}>
                {insightsSource === 'live' ? 'live' : insightsSource === 'error' ? 'ошибка источника' : 'кэш'}
              </Chip>
            )
          }
        />
        <div className="px-2 pb-4">
          {insightsApi.loading ? (
            <Loading />
          ) : insightsApi.error ? (
            <div className="px-3 pb-3"><ErrorNote>{insightsApi.error}</ErrorNote></div>
          ) : insightRows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Нет данных по расходам"
              hint="За выбранный период не было активных кампаний или статистика ещё не подтянулась."
            />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={insightRows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="adsSpendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CLAY} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={CLAY} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDay}
                  tick={{ fontSize: 11, fill: '#8A847C' }}
                  axisLine={{ stroke: GRID }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="spend"
                  tick={{ fontSize: 11, fill: '#8A847C' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={(v) => fmtInt(v)}
                />
                <YAxis
                  yAxisId="cpc"
                  orientation="right"
                  tick={{ fontSize: 11, fill: SLATE }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => fmtInt(v)}
                />
                <Tooltip content={<ChartTip />} cursor={{ fill: 'rgba(217,119,87,0.06)' }} />
                <Area
                  yAxisId="spend"
                  type="monotone"
                  dataKey="spend"
                  stroke="none"
                  fill="url(#adsSpendFill)"
                  isAnimationActive={false}
                />
                <Bar
                  yAxisId="spend"
                  dataKey="spend"
                  fill={CLAY}
                  fillOpacity={0.55}
                  radius={[3, 3, 0, 0]}
                  barSize={22}
                />
                <Line
                  yAxisId="cpc"
                  type="monotone"
                  dataKey="cpc"
                  stroke={SLATE}
                  strokeWidth={1.5}
                  dot={{ r: 2, fill: SLATE, strokeWidth: 0 }}
                  activeDot={{ r: 3.5 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* ── Campaigns table ─────────────────────────────────────── */}
      <Card>
        <CardHead title="Кампании" sub="Платные бусты винеров" />
        {campaignsApi.loading ? (
          <Loading />
        ) : campaignsApi.error ? (
          <div className="px-5 pb-5"><ErrorNote>{campaignsApi.error}</ErrorNote></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="Нет кампаний"
            hint="Забусти винера на странице «Винеры», чтобы запустить платную раскрутку."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-line-soft">
                  <th className="font-medium px-5 py-2.5">Название</th>
                  <th className="font-medium px-3 py-2.5">Платформа</th>
                  <th className="font-medium px-3 py-2.5">Статус</th>
                  <th className="font-medium px-3 py-2.5 text-right">Бюджет/день</th>
                  <th className="font-medium px-3 py-2.5 text-right">Расход всего</th>
                  <th className="font-medium px-3 py-2.5 text-right">CPC</th>
                  <th className="font-medium px-3 py-2.5 text-right">CTR</th>
                  <th className="font-medium px-5 py-2.5 text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const active = c.status === 'ACTIVE'
                  const cpc = rowCpc(c.latest)
                  const ctr = c.latest?.ctr
                  const isBusy = busy === c.id
                  return (
                    <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-surface/60">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink truncate max-w-[220px]">
                          {c.name || `Кампания #${c.id}`}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <PlatformDot platform={c.platform} />
                      </td>
                      <td className="px-3 py-3">
                        <Chip variant={active ? 'good' : 'warn'}>
                          {active ? 'ACTIVE' : 'PAUSED'}
                        </Chip>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                        {fmtTenge(c.daily_budget_kzt || 0)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                        {fmtTenge(c.total_spend_kzt || 0)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                        {cpc == null ? '—' : fmtTenge(cpc)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-soft">
                        {ctr == null ? '—' : `${(Number(ctr) || 0).toFixed(2)}%`}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {active ? (
                          <Btn
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => mutate(c.id, 'pause')}
                            className="gap-1.5"
                          >
                            <Pause size={14} /> {isBusy ? '…' : 'Пауза'}
                          </Btn>
                        ) : (
                          <Btn
                            variant="primary"
                            disabled={isBusy}
                            onClick={() => mutate(c.id, 'activate')}
                            className="gap-1.5"
                          >
                            <Play size={14} /> {isBusy ? '…' : 'Запустить'}
                          </Btn>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-2 text-xs text-faint px-1">
        <Info size={13} className="mt-0.5 shrink-0" />
        <p>
          Продажи идут на Kaspi (off-domain), поэтому ROAS оценивается как прокси по link-click&apos;ам,
          а не как точная атрибуция. Главная метрика эффективности — cost per link-click.
        </p>
      </div>
    </div>
  )
}
