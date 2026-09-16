import { useState } from 'react'
import {
  Sparkles, Check, X, Hash, BrainCircuit, Loader2, Power, CalendarClock, Inbox,
} from 'lucide-react'
import {
  useApi, api, Card, CardHead, Section, Chip, Btn,
  Loading, EmptyState, ErrorNote, PlatformDot, fmtInt, cx,
} from '../components/ui.jsx'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// ── this-week's plan + autopilot controls ────────────────────────────────────
function AutopilotCard({ latest, settings, reloadAll }) {
  const run = latest?.run
  const [n, setN] = useState(5)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const s = settings || {}
  const [form, setForm] = useState({
    autopilot_enabled: !!s.autopilot_enabled,
    autopilot_weekday: s.autopilot_weekday ?? 0,
    autopilot_hour: s.autopilot_hour ?? 9,
  })
  const [savedAt, setSavedAt] = useState(false)

  async function runNow() {
    setBusy(true); setErr(null)
    try {
      await api.post('/strategy/run', { n_products: Number(n) || 5 })
      await reloadAll()
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message)
    } finally { setBusy(false) }
  }

  async function saveSchedule(next) {
    const body = { ...form, ...next }
    setForm(body)
    try {
      await api.put('/settings', {
        autopilot_enabled: body.autopilot_enabled,
        autopilot_weekday: Number(body.autopilot_weekday),
        autopilot_hour: Number(body.autopilot_hour),
        autopilot_n_products: Number(n) || 5,
      })
      setSavedAt(true); setTimeout(() => setSavedAt(false), 2000)
    } catch (e) { setErr(e?.response?.data?.detail || e.message) }
  }

  return (
    <Card>
      <CardHead
        title="Авто-пилот стратега"
        sub="Claude сам решает, что продвигать на этой неделе, и готовит черновики"
        right={<BrainCircuit size={18} className="text-clay-500" />}
      />
      <div className="px-5 pb-5 space-y-4">
        {/* run controls */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Товаров в план:</span>
          <input
            type="number" min={1} max={10} value={n}
            onChange={(e) => setN(e.target.value)}
            className="input !py-1.5 !text-sm w-16" disabled={busy}
          />
          <Btn variant="primary" onClick={runNow} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin mr-1.5" />
                  : <Sparkles size={14} className="mr-1.5" />}
            {busy ? 'Стратег думает…' : 'Запустить сейчас'}
          </Btn>
        </div>

        {err && <ErrorNote>{err}</ErrorNote>}

        {/* the plan */}
        {run ? (
          <div className="rounded-xl bg-surface border border-line-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-soft">
                План недели · {run.week_of}
              </span>
              <span className="text-[11px] text-faint">
                {fmtInt(run.ideas_generated)} черновиков · ≈{run.cost_estimate} $
                {run.trigger === 'schedule' ? ' · авто' : ''}
              </span>
            </div>
            {run.summary && (
              <p className="text-sm text-ink-soft leading-relaxed">{run.summary}</p>
            )}
            <div className="space-y-2">
              {(run.plan || []).map((pick, i) => (
                <div key={i} className="rounded-lg bg-raised border border-line-soft px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink">{pick.title}</span>
                    <Chip variant="neutral">{pick.category}</Chip>
                    <span className="text-xs text-faint tabular-nums">{fmtInt(pick.price)} ₸</span>
                  </div>
                  {pick.why && <p className="text-xs text-muted mt-1">{pick.why}</p>}
                  {!!(pick.angles && pick.angles.length) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {pick.angles.map((a, j) => <Chip key={j} variant="clay">{a}</Chip>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">
            Плана ещё нет — запусти стратега, и он выберет товары и подготовит идеи.
          </p>
        )}

        {/* schedule */}
        <div className="rounded-xl border border-line-soft p-3 flex flex-wrap items-center gap-3">
          <button
            onClick={() => saveSchedule({ autopilot_enabled: !form.autopilot_enabled })}
            className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              form.autopilot_enabled ? 'bg-good-bg text-good' : 'bg-line-soft text-ink-soft')}
          >
            <Power size={13} /> {form.autopilot_enabled ? 'Автозапуск включён' : 'Автозапуск выключен'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock size={13} /> каждую
          </span>
          <select
            value={form.autopilot_weekday}
            onChange={(e) => saveSchedule({ autopilot_weekday: e.target.value })}
            className="input !py-1.5 !text-sm w-20"
          >
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <span className="text-xs text-muted">в</span>
          <input
            type="number" min={0} max={23} value={form.autopilot_hour}
            onChange={(e) => saveSchedule({ autopilot_hour: e.target.value })}
            className="input !py-1.5 !text-sm w-16"
          />
          <span className="text-xs text-faint">:00 (Алматы)</span>
          {savedAt && <Chip variant="good"><Check size={12} className="mr-1" />сохранено</Chip>}
        </div>
      </div>
    </Card>
  )
}

// ── one item in the review queue ─────────────────────────────────────────────
function ReviewCard({ idea, busy, onApprove, onReject }) {
  return (
    <Card className="card-pad">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip variant="clay">{idea.angle || 'Идея'}</Chip>
        {idea.source === 'autopilot' && (
          <Chip variant="info"><BrainCircuit size={11} className="mr-1" />авто-пилот</Chip>
        )}
        {idea.product_title && (
          <span className="text-xs text-muted truncate">{idea.product_title}</span>
        )}
      </div>
      {idea.hook && (
        <p className="mt-2 text-[15px] font-semibold text-ink leading-snug">{idea.hook}</p>
      )}
      {idea.caption && (
        <p className="mt-1.5 text-sm text-ink-soft leading-relaxed line-clamp-3">{idea.caption}</p>
      )}
      {!!(idea.hashtags && idea.hashtags.length) && (
        <p className="mt-2 flex items-center gap-1 text-xs text-faint flex-wrap">
          <Hash size={12} className="shrink-0" />
          {idea.hashtags.map((h) => <span key={h}>{h.replace(/^#/, '')}</span>)}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {(idea.target_platforms || []).map((p) => <PlatformDot key={p} platform={p} />)}
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="primary" disabled={busy} onClick={() => onApprove(idea.id)}>
            <Check size={14} className="mr-1" /> Одобрить
          </Btn>
          <Btn variant="ghost" disabled={busy} onClick={() => onReject(idea.id)}>
            <X size={14} className="mr-1" /> Отклонить
          </Btn>
        </div>
      </div>
    </Card>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function Review() {
  const latest = useApi('/strategy/latest')
  const queue = useApi('/content/ideas?status=draft')
  const settings = useApi('/settings')
  const [busy, setBusy] = useState(false)

  const reloadAll = async () => { latest.reload(); queue.reload() }

  async function approve(id) {
    setBusy(true)
    try {
      await api.post(`/content/ideas/${id}/fanout`, {}) // approve → fan out to platform posts
      await reloadAll()
    } finally { setBusy(false) }
  }
  async function reject(id) {
    setBusy(true)
    try {
      await api.post(`/content/ideas/${id}/reject`)
      await reloadAll()
    } finally { setBusy(false) }
  }

  if (latest.loading || settings.loading) return <Loading />

  const drafts = queue.data || []
  const pending = latest.data?.pending_review ?? drafts.length

  return (
    <div className="space-y-8 pb-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Авто-пилот и проверка</h1>
          <p className="text-sm text-muted mt-1">
            Стратег выбирает и пишет — ты только утверждаешь креативы перед публикацией
          </p>
        </div>
        <Chip variant={pending > 0 ? 'clay' : 'neutral'}>
          <Inbox size={12} className="mr-1" /> на проверке: {fmtInt(pending)}
        </Chip>
      </header>

      <AutopilotCard latest={latest.data} settings={settings.data} reloadAll={reloadAll} />

      <Section title="На проверку" sub="Твоя единственная задача: одобрить или отклонить">
        {queue.loading ? (
          <Card><Loading label="Загрузка очереди…" /></Card>
        ) : queue.error ? (
          <ErrorNote>{queue.error}</ErrorNote>
        ) : drafts.length === 0 ? (
          <Card>
            <EmptyState
              icon={Sparkles}
              title="Очередь пуста"
              hint="Запусти авто-пилот выше — стратег подготовит идеи, и они появятся здесь на утверждение."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {drafts.map((idea) => (
              <ReviewCard key={idea.id} idea={idea} busy={busy}
                onApprove={approve} onReject={reject} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
