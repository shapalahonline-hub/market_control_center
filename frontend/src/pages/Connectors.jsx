import { useState } from 'react'
import {
  Plug, Settings2, Upload, ChevronDown, RefreshCw, Check, X,
  ShieldCheck, KeyRound, Sliders, Package,
} from 'lucide-react'
import {
  useApi, api, Card, CardHead, Section, Chip, Btn,
  Loading, EmptyState, ErrorNote, fmtInt, cx,
} from '../components/ui.jsx'

// ── connector vocab ──────────────────────────────────────────────────────────
const CONNECTOR_META = {
  meta: { label: 'Meta', hint: 'Реклама Facebook / Instagram', color: '#4A6FA5' },
  instagram: { label: 'Instagram', hint: 'Публикация и метрики', color: '#C2553F' },
  tiktok: { label: 'TikTok', hint: 'Публикация и метрики', color: '#262421' },
  youtube: { label: 'YouTube', hint: 'Публикация и метрики', color: '#B0473A' },
  higgsfield: { label: 'Higgsfield', hint: 'Генерация видео-ассетов', color: '#6E8E6A' },
}
const ORDER = ['meta', 'instagram', 'tiktok', 'youtube', 'higgsfield']

const STATUS_CHIP = {
  connected: { variant: 'good', label: 'подключён' },
  disconnected: { variant: 'neutral', label: 'не подключён' },
  error: { variant: 'bad', label: 'ошибка' },
}

function fmtSynced(iso) {
  if (!iso) return 'нет синхронизации'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── small field helper ───────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-faint mt-1">{hint}</span>}
    </label>
  )
}

// ── connector card ───────────────────────────────────────────────────────────
function ConnectorCard({ conn, onSaved }) {
  const meta = CONNECTOR_META[conn.platform] || { label: conn.platform, hint: '', color: '#8A847C' }
  const status = STATUS_CHIP[conn.status] || STATUS_CHIP.disconnected
  const isMeta = conn.platform === 'meta'

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    display_name: conn.display_name || '',
    account_id: conn.account_id || '',
    access_token: '',
    ad_account_id: conn.meta?.ad_account_id || '',
    page_id: conn.meta?.page_id || '',
    ig_user_id: conn.meta?.ig_user_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null) // {ok,detail}

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save() {
    setSaving(true); setSaveErr(null)
    try {
      const body = {
        display_name: form.display_name || null,
        account_id: form.account_id || null,
      }
      if (form.access_token) body.access_token = form.access_token
      if (isMeta) {
        body.meta = {
          ad_account_id: form.ad_account_id || null,
          page_id: form.page_id || null,
          ig_user_id: form.ig_user_id || null,
        }
      }
      await api.put(`/connectors/${conn.platform}`, body)
      setForm((f) => ({ ...f, access_token: '' })) // token write-only, clear after save
      await onSaved()
    } catch (e) {
      setSaveErr(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true); setTestResult(null)
    try {
      const r = await api.post(`/connectors/${conn.platform}/test`)
      setTestResult(r.data || { ok: false, detail: 'нет ответа' })
    } catch (e) {
      setTestResult({ ok: false, detail: e?.response?.data?.detail || e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-semibold shrink-0"
          style={{ background: meta.color }}
        >
          {meta.label.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-ink truncate">
              {conn.display_name || meta.label}
            </span>
            <Chip variant={status.variant}>{status.label}</Chip>
            {conn.access_token && (
              <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                <KeyRound size={11} /> токен
              </span>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5 truncate">
            {conn.account_id ? `@${conn.account_id}` : meta.hint}
            <span className="text-faint"> · {fmtSynced(conn.last_synced_at)}</span>
          </div>
        </div>
        <ChevronDown
          size={18}
          className={cx('text-faint transition-transform shrink-0', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="border-t border-line-soft px-5 py-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Отображаемое имя">
              <input className="input" value={form.display_name} onChange={set('display_name')}
                placeholder={meta.label} />
            </Field>
            <Field label="ID аккаунта / хэндл">
              <input className="input" value={form.account_id} onChange={set('account_id')}
                placeholder="например, my_shop" />
            </Field>
          </div>

          <Field label="Access token" hint="Хранится только на сервере. Оставьте пустым, чтобы не менять.">
            <input
              className="input font-mono" type="password" autoComplete="new-password"
              value={form.access_token} onChange={set('access_token')}
              placeholder={conn.access_token ? '•••••••• (сохранён)' : 'вставьте токен'}
            />
          </Field>

          {isMeta && (
            <div className="rounded-xl bg-surface border border-line-soft p-3 space-y-3">
              <div className="text-xs font-medium text-ink-soft flex items-center gap-1.5">
                <Sliders size={13} /> Параметры Meta
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Ad account ID">
                  <input className="input" value={form.ad_account_id} onChange={set('ad_account_id')}
                    placeholder="act_123…" />
                </Field>
                <Field label="Page ID">
                  <input className="input" value={form.page_id} onChange={set('page_id')} />
                </Field>
                <Field label="IG user ID">
                  <input className="input" value={form.ig_user_id} onChange={set('ig_user_id')} />
                </Field>
              </div>
            </div>
          )}

          {saveErr && <ErrorNote>{saveErr}</ErrorNote>}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Btn variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </Btn>
            <Btn variant="outline" onClick={test} disabled={testing}>
              <RefreshCw size={14} className={cx('mr-1.5', testing && 'animate-spin')} />
              Проверить
            </Btn>
            {testResult && (
              <Chip variant={testResult.ok ? 'good' : 'bad'}>
                {testResult.ok ? <Check size={12} className="mr-1" /> : <X size={12} className="mr-1" />}
                {testResult.detail || (testResult.ok ? 'связь в порядке' : 'не удалось')}
              </Chip>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── settings section ─────────────────────────────────────────────────────────
function SettingsCard({ settings, reload }) {
  const [form, setForm] = useState({
    timezone: settings.timezone || '',
    winner_min_score: settings.winner_min_score ?? '',
    utm_default: settings.utm_default || '',
    cadence_caps: {
      instagram: settings.cadence_caps?.instagram ?? '',
      tiktok: settings.cadence_caps?.tiktok ?? '',
      youtube: settings.cadence_caps?.youtube ?? '',
    },
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(false)

  const setCap = (p) => (e) =>
    setForm((f) => ({ ...f, cadence_caps: { ...f.cadence_caps, [p]: e.target.value } }))

  async function save() {
    setSaving(true); setErr(null); setOk(false)
    try {
      const num = (v) => (v === '' || v == null ? null : Number(v))
      await api.put('/settings', {
        timezone: form.timezone || null,
        winner_min_score: num(form.winner_min_score),
        utm_default: form.utm_default || null,
        cadence_caps: {
          instagram: num(form.cadence_caps.instagram),
          tiktok: num(form.cadence_caps.tiktok),
          youtube: num(form.cadence_caps.youtube),
        },
      })
      setOk(true)
      await reload()
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHead
        title="Параметры пайплайна"
        sub="Порог победителя, лимиты публикаций и часовой пояс"
        right={<Settings2 size={18} className="text-faint" />}
      />
      <div className="px-5 pb-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Минимальный счёт победителя" hint="Посты ниже не попадают в победители">
            <input className="input tabular-nums" type="number" step="0.1"
              value={form.winner_min_score} onChange={(e) => setForm((f) => ({ ...f, winner_min_score: e.target.value }))} />
          </Field>
          <Field label="Часовой пояс">
            <input className="input" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="Asia/Almaty" />
          </Field>
        </div>

        <div>
          <span className="label">Лимит публикаций в день</span>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {[['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube']].map(([k, l]) => (
              <label key={k} className="block">
                <span className="block text-[11px] text-muted mb-1">{l}</span>
                <input className="input tabular-nums" type="number" min="0"
                  value={form.cadence_caps[k]} onChange={setCap(k)} />
              </label>
            ))}
          </div>
        </div>

        <Field label="UTM по умолчанию">
          <input className="input font-mono" value={form.utm_default} onChange={(e) => setForm((f) => ({ ...f, utm_default: e.target.value }))}
            placeholder="utm_source=…" />
        </Field>

        {err && <ErrorNote>{err}</ErrorNote>}

        <div className="flex items-center gap-2 pt-1">
          <Btn variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить настройки'}
          </Btn>
          {ok && !err && (
            <Chip variant="good"><Check size={12} className="mr-1" />сохранено</Chip>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── import section ───────────────────────────────────────────────────────────
function ImportCard({ productCount, onImported }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [result, setResult] = useState(null) // {imported}

  async function run() {
    if (!text.trim()) return
    setBusy(true); setErr(null); setResult(null)
    try {
      const r = await api.post('/products/import', { text })
      setResult(r.data || { imported: 0 })
      setText('')
      await onImported()
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead
        title="Импорт товаров"
        sub="По строке на товар"
        right={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Package size={14} /> {fmtInt(productCount)} в каталоге
          </span>
        }
      />
      <div className="px-5 pb-5 space-y-3">
        <div className="text-[11px] text-faint font-mono bg-surface border border-line-soft rounded-lg px-3 py-2">
          sku | название | категория | цена | url
        </div>
        <textarea
          className="input font-mono text-[13px] leading-relaxed min-h-[160px] resize-y"
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'123 | Стул дубовый | Мебель | 24990 | https://kaspi.kz/...\n456 | Люстра модерн | Свет | 89990 | https://kaspi.kz/...'}
        />

        {err && <ErrorNote>{err}</ErrorNote>}

        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={run} disabled={busy || !text.trim()}>
            <Upload size={14} className="mr-1.5" />
            {busy ? 'Импорт…' : 'Импортировать'}
          </Btn>
          {result && (
            <Chip variant={result.imported > 0 ? 'good' : 'neutral'}>
              <Check size={12} className="mr-1" />
              добавлено: {fmtInt(result.imported)}
            </Chip>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function Connectors() {
  const connectors = useApi('/connectors')
  const settings = useApi('/settings')
  const products = useApi('/products')

  const loading = connectors.loading || settings.loading || products.loading
  const error = connectors.error || settings.error || products.error

  if (loading) return <Loading />
  if (error) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-display text-2xl text-ink">Коннекторы и настройки</h1>
        </header>
        <ErrorNote>{error}</ErrorNote>
      </div>
    )
  }

  const rawConnectors = connectors.data || []
  // keep known order; surface any extras at the end
  const sorted = [
    ...ORDER
      .map((p) => rawConnectors.find((c) => c.platform === p))
      .filter(Boolean),
    ...rawConnectors.filter((c) => !ORDER.includes(c.platform)),
  ]
  const connectedCount = rawConnectors.filter((c) => c.status === 'connected').length

  return (
    <div className="space-y-8 pb-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Коннекторы и настройки</h1>
          <p className="text-sm text-muted mt-1">
            Интеграции площадок, параметры пайплайна и импорт каталога
          </p>
        </div>
        {rawConnectors.length > 0 && (
          <Chip variant={connectedCount > 0 ? 'good' : 'neutral'}>
            <ShieldCheck size={12} className="mr-1" />
            {connectedCount}/{rawConnectors.length} подключено
          </Chip>
        )}
      </header>

      <Section
        title="Коннекторы"
        sub="Площадки публикации и рекламные кабинеты"
        right={<Plug size={18} className="text-faint" />}
      >
        {sorted.length === 0 ? (
          <Card>
            <EmptyState
              icon={Plug}
              title="Нет коннекторов"
              hint="Площадки появятся здесь после первой настройки на сервере."
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {sorted.map((c) => (
              <ConnectorCard key={c.platform} conn={c} onSaved={connectors.reload} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Настройки">
        <SettingsCard settings={settings.data || {}} reload={settings.reload} />
      </Section>

      <Section title="Импорт товаров">
        <ImportCard
          productCount={(products.data || []).length}
          onImported={products.reload}
        />
      </Section>
    </div>
  )
}
