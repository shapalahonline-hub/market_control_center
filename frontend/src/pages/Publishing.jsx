import { useState } from 'react'
import {
  Send, Bot, Copy, Check, ExternalLink, Film, Clock, AlertTriangle, Link2,
} from 'lucide-react'
import {
  useApi, api, Card, CardHead, Section, Chip, Btn,
  Loading, EmptyState, ErrorNote, PlatformDot, POST_STATE, fmtInt, cx,
} from '../components/ui.jsx'

function fmtWhen(iso) {
  if (!iso) return 'сейчас'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function CopyBtn({ text }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text || '') } catch { /* ignore */ }
        setDone(true); setTimeout(() => setDone(false), 1500)
      }}
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'скопировано' : 'копировать'}
    </button>
  )
}

// ── one post waiting to be published ─────────────────────────────────────────
function QueueCard({ item, busy, onPublished, onFail }) {
  return (
    <Card className="card-pad">
      <div className="flex items-center justify-between gap-2">
        <PlatformDot platform={item.platform} />
        <span className="inline-flex items-center gap-1 text-xs text-faint">
          <Clock size={12} /> {fmtWhen(item.scheduled_for)}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink leading-snug">{item.product_title}</p>

      <div className="mt-2 rounded-lg bg-surface border border-line-soft p-2.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-faint">Подпись</span>
          <CopyBtn text={item.caption} />
        </div>
        <p className="text-xs text-ink-soft leading-relaxed whitespace-pre-wrap line-clamp-4">
          {item.caption}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        {item.asset_url && (
          <a href={item.asset_url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-clay-600 hover:underline">
            <Film size={12} /> видео
          </a>
        )}
        {item.share_link && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Link2 size={12} /> {item.share_link.replace(/^https?:\/\//, '')}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Btn variant="primary" disabled={busy} onClick={() => onPublished(item.post_id)}>
          <Send size={14} className="mr-1" /> Опубликовано
        </Btn>
        <Btn variant="ghost" disabled={busy} onClick={() => onFail(item.post_id)}>
          <AlertTriangle size={14} className="mr-1" /> Ошибка
        </Btn>
      </div>
    </Card>
  )
}

export default function Publishing() {
  const queue = useApi('/posts/publish-queue')
  const inflight = useApi('/posts?state=publishing')
  const recent = useApi('/posts?state=measuring')
  const [busy, setBusy] = useState(false)

  const reload = () => { queue.reload(); inflight.reload(); recent.reload() }

  async function markPublished(id) {
    const ppid = window.prompt('ID публикации на платформе (ссылка или ID поста):')
    if (!ppid) return
    setBusy(true)
    try {
      await api.post(`/posts/${id}/published`, {
        platform_post_id: ppid.trim(),
        permalink: ppid.trim().startsWith('http') ? ppid.trim() : null,
      })
      reload()
    } finally { setBusy(false) }
  }
  async function markFail(id) {
    setBusy(true)
    try { await api.post(`/posts/${id}/fail`, { reason: 'manual' }); reload() }
    finally { setBusy(false) }
  }

  if (queue.loading) return <Loading />

  const q = queue.data || []
  const flying = inflight.data || []
  const done = (recent.data || []).slice(0, 8)

  return (
    <div className="space-y-8 pb-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Публикация</h1>
          <p className="text-sm text-muted mt-1">
            Очередь готовых постов — их публикует агент, или вы вручную
          </p>
        </div>
        <Chip variant={q.length ? 'clay' : 'neutral'}>
          <Send size={12} className="mr-1" /> в очереди: {fmtInt(q.length)}
        </Chip>
      </header>

      {/* agent explainer */}
      <Card className="card-pad bg-surface/60">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-info-bg flex items-center justify-center shrink-0">
            <Bot size={18} className="text-info" />
          </span>
          <div className="text-sm text-ink-soft leading-relaxed">
            <span className="font-semibold text-ink">Агент публикации</span> берёт посты из этой
            очереди и выкладывает их в Instagram / TikTok / YouTube, управляя браузером — без
            официальных API. Каждый пост готов к загрузке: видео, подпись и ссылка ниже.
            Пока агент не запущен, можно опубликовать вручную по этим же данным.
          </div>
        </div>
      </Card>

      {/* in progress */}
      {flying.length > 0 && (
        <Section title="Публикуется сейчас" sub="Агент работает над этими постами">
          <div className="grid gap-3 md:grid-cols-3">
            {flying.map((p) => (
              <Card key={p.id} className="card-pad">
                <div className="flex items-center justify-between">
                  <PlatformDot platform={p.platform} />
                  <Chip variant={POST_STATE.publishing.variant}>{POST_STATE.publishing.label}</Chip>
                </div>
                <p className="mt-2 text-sm font-medium text-ink line-clamp-1">{p.product_title}</p>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* the queue */}
      <Section title="Очередь публикации" sub="Одобренные посты с готовым видео, которым пора выходить">
        {queue.error ? (
          <ErrorNote>{queue.error}</ErrorNote>
        ) : q.length === 0 ? (
          <Card>
            <EmptyState
              icon={Send}
              title="Очередь пуста"
              hint="Посты появятся здесь, когда у одобренной идеи будет готовое видео и наступит время публикации."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {q.map((item) => (
              <QueueCard key={item.post_id} item={item} busy={busy}
                onPublished={markPublished} onFail={markFail} />
            ))}
          </div>
        )}
      </Section>

      {/* recently published */}
      {done.length > 0 && (
        <Section title="Недавно опубликовано">
          <Card className="!p-0 overflow-hidden divide-y divide-line-soft">
            {done.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <PlatformDot platform={p.platform} />
                  <span className="text-sm text-ink truncate">{p.product_title}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted tabular-nums">
                    {p.latest?.views != null ? `${fmtInt(p.latest.views)} просм.` : '—'}
                  </span>
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer"
                      className="text-faint hover:text-ink"><ExternalLink size={14} /></a>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </Section>
      )}
    </div>
  )
}
