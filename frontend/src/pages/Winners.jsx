import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Trophy, RefreshCw, Rocket, Sparkles, ExternalLink,
  Eye, MousePointerClick, Zap, X, CheckCircle2,
} from 'lucide-react'
import {
  useApi, api,
  Section, Card, Stat, Chip, Btn,
  Loading, EmptyState, ErrorNote,
  PlatformDot, fmtInt, cx,
} from '../components/ui.jsx'

// ── small ephemeral toast ─────────────────────────────────────────────────────
function Toast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 animate-[fade-in_.2s_ease]">
      <div className="card card-pad flex items-center gap-3 shadow-card min-w-[220px]">
        <span className="w-7 h-7 rounded-lg bg-good-bg flex items-center justify-center shrink-0">
          <CheckCircle2 size={16} className="text-good" />
        </span>
        <span className="text-sm text-ink flex-1">{toast}</span>
        <button onClick={onClose} className="text-faint hover:text-ink-soft">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}

const MEDAL = ['#C99A4B', '#9AA3AC', '#B98A5E'] // gold / silver / bronze

function Rank({ i }) {
  const color = MEDAL[i]
  if (color) {
    return (
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-display text-sm tabular-nums text-white"
        style={{ background: color }}
      >
        {i + 1}
      </span>
    )
  }
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-display text-sm tabular-nums bg-line-soft text-ink-soft">
      {i + 1}
    </span>
  )
}

// reason → chip variant heuristic (string reason from backend)
function reasonVariant(reason = '') {
  const r = String(reason).toLowerCase()
  if (/clicks|клик|конверс|cpc/.test(r)) return 'clay'
  if (/reach|охват|views|просмотр/.test(r)) return 'info'
  if (/engagement|вовлеч|like|save|сохран/.test(r)) return 'good'
  return 'neutral'
}

function Metric({ icon: Icon, value, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft tabular-nums">
      <Icon size={13} className="text-faint" />
      <span className="font-medium text-ink">{fmtInt(value)}</span>
      <span className="text-muted">{label}</span>
    </span>
  )
}

function WinnerCard({ w, i, onToast }) {
  const [budget, setBudget] = useState(2000)
  const [showBudget, setShowBudget] = useState(false)
  const [boosting, setBoosting] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const [err, setErr] = useState(null)
  // local optimistic overlay so the card reflects new state without a full reload
  const [boosted, setBoosted] = useState(!!w.boosted)
  const [spunCount, setSpunCount] = useState(w.variations_created || 0)
  const [justSpun, setJustSpun] = useState(null)

  const m = w.metric || {}

  async function doBoost() {
    setErr(null)
    setBoosting(true)
    try {
      await api.post('/ads/boost', {
        winner_id: w.id,
        daily_budget_kzt: Number(budget) || 0,
      })
      setBoosted(true)
      setShowBudget(false)
      onToast('Буст создан (на паузе)')
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || 'Не удалось забустить')
    } finally {
      setBoosting(false)
    }
  }

  async function doSpin() {
    setErr(null)
    setSpinning(true)
    try {
      const r = await api.post(`/winners/${w.id}/spin`)
      const n = (r.data?.variations || []).length
      setSpunCount((c) => c + n)
      setJustSpun(n)
      onToast(`${n} новых идей — в пайплайне (черновики)`)
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || 'Не удалось создать вариации')
    } finally {
      setSpinning(false)
    }
  }

  return (
    <Card className="card-pad">
      <div className="flex gap-4">
        <Rank i={i} />

        <div className="flex-1 min-w-0 space-y-3">
          {/* top row: platform / product / score */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <PlatformDot platform={w.platform} />
                {boosted ? (
                  <Chip variant="clay">забустен</Chip>
                ) : (
                  <Chip variant={reasonVariant(w.reason)}>{w.reason || 'винер'}</Chip>
                )}
              </div>
              <p className="text-[15px] font-semibold text-ink mt-1.5 truncate">
                {w.product_title || 'Без товара'}
              </p>
              {w.caption && (
                <p className="text-xs text-muted mt-1 line-clamp-2 max-w-xl">{w.caption}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-3xl text-clay-600 tabular-nums leading-none">
                {fmtInt(w.score)}
              </div>
              <div className="text-[11px] text-muted mt-1 uppercase tracking-wide">score</div>
            </div>
          </div>

          {/* metrics */}
          {(m.views != null || m.link_clicks != null || m.reach != null) && (
            <div className="flex items-center gap-4 flex-wrap pt-0.5">
              {m.views != null && <Metric icon={Eye} value={m.views} label="просмотров" />}
              {m.link_clicks != null && (
                <Metric icon={MousePointerClick} value={m.link_clicks} label="кликов" />
              )}
              {m.reach != null && <Metric icon={Zap} value={m.reach} label="охват" />}
              {w.permalink && (
                <a
                  href={w.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-clay-700 hover:text-clay-600"
                >
                  <ExternalLink size={12} /> пост
                </a>
              )}
            </div>
          )}

          {err && <ErrorNote>{err}</ErrorNote>}

          {/* boost budget inline editor */}
          {showBudget && !boosted && (
            <div className="flex items-center gap-2 flex-wrap rounded-xl bg-surface border border-line-soft px-3 py-2.5">
              <label className="label !mb-0">Бюджет/день, ₸</label>
              <input
                type="number"
                min={0}
                step={500}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="input !w-32 !py-1.5"
                disabled={boosting}
              />
              <Btn variant="primary" onClick={doBoost} disabled={boosting}>
                <Rocket size={14} /> {boosting ? 'Бустим…' : 'Запустить буст'}
              </Btn>
              <Btn variant="ghost" onClick={() => { setShowBudget(false); setErr(null) }} disabled={boosting}>
                Отмена
              </Btn>
            </div>
          )}

          {/* actions */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {boosted ? (
              <Chip variant="good">
                <CheckCircle2 size={12} className="-ml-0.5 mr-1" /> буст создан (на паузе)
              </Chip>
            ) : (
              !showBudget && (
                <Btn variant="primary" onClick={() => { setShowBudget(true); setErr(null) }}>
                  <Rocket size={14} /> Бустить
                </Btn>
              )
            )}

            <Btn variant="outline" onClick={doSpin} disabled={spinning}>
              <Sparkles size={14} /> {spinning ? 'Генерим…' : 'Сделать вариации'}
            </Btn>

            {justSpun != null && (
              <Link to="/pipeline" className="inline-flex items-center gap-1 text-xs text-clay-700 hover:text-clay-600">
                {justSpun} новых идей → в пайплайн
              </Link>
            )}
            {justSpun == null && spunCount > 0 && (
              <span className="text-xs text-muted">{fmtInt(spunCount)} вариаций создано</span>
            )}
            {boosted && (
              <Link to="/ads" className="inline-flex items-center gap-1 text-xs text-clay-700 hover:text-clay-600">
                в кампании <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Winners() {
  const { data, loading, error, reload } = useApi('/winners')
  const [computing, setComputing] = useState(false)
  const [computeErr, setComputeErr] = useState(null)
  const [toast, setToast] = useState(null)

  function fireToast(msg) {
    setToast(msg)
    window.clearTimeout(fireToast._t)
    fireToast._t = window.setTimeout(() => setToast(null), 3500)
  }

  async function compute() {
    setComputeErr(null)
    setComputing(true)
    try {
      const r = await api.post('/winners/compute')
      const created = r.data?.winners_created ?? 0
      const scored = r.data?.scored
      fireToast(
        created > 0
          ? `Найдено винеров: ${created}${scored != null ? ` (оценено ${scored})` : ''}`
          : `Новых винеров нет${scored != null ? ` (оценено ${scored})` : ''}`,
      )
      reload()
    } catch (e) {
      setComputeErr(e?.response?.data?.detail || e.message || 'Не удалось пересчитать')
    } finally {
      setComputing(false)
    }
  }

  const winners = Array.isArray(data) ? data : []
  const monthCount = winners.length
  const boostedCount = winners.filter((w) => w.boosted).length

  return (
    <div className="space-y-6">
      <Section
        title="Винеры"
        sub="Еженедельный цикл: лучшие посты → буст и новые вариации"
        right={
          <Btn variant="primary" onClick={compute} disabled={computing}>
            <RefreshCw size={14} className={cx(computing && 'animate-spin')} />
            {computing ? 'Считаем…' : 'Пересчитать винеров'}
          </Btn>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Винеров за месяц" value={fmtInt(monthCount)} accent />
          <Stat
            label="Забустено"
            value={fmtInt(boostedCount)}
            sub={monthCount ? `из ${fmtInt(monthCount)}` : undefined}
          />
          <Stat
            label="Ожидают буста"
            value={fmtInt(Math.max(monthCount - boostedCount, 0))}
            sub="готовы к запуску"
          />
        </div>
      </Section>

      {computeErr && <ErrorNote>{computeErr}</ErrorNote>}

      <Section title="Победители недели">
        {loading ? (
          <Card><Loading /></Card>
        ) : error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : winners.length === 0 ? (
          <Card>
            <EmptyState
              icon={Trophy}
              title="Пока нет винеров"
              hint="Опубликуй контент, дай метрикам накопиться и пересчитай винеров."
              action={
                <Btn variant="primary" onClick={compute} disabled={computing}>
                  <RefreshCw size={14} className={cx(computing && 'animate-spin')} />
                  Пересчитать винеров
                </Btn>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {winners.map((w, i) => (
              <WinnerCard key={w.id ?? i} w={w} i={i} onToast={fireToast} />
            ))}
          </div>
        )}
      </Section>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
