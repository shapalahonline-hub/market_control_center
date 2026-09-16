import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles, Check, X, Share2, Eye, Paperclip, Send, Lightbulb,
  Workflow, Hash, Loader2,
} from 'lucide-react'
import {
  useApi, api, Card, CardHead, Section, Chip, Btn,
  Loading, EmptyState, ErrorNote, PlatformDot, POST_STATE,
  fmtInt, cx,
} from '../components/ui.jsx'

const KANBAN_COLUMNS = ['idea', 'asset_ready', 'approved', 'scheduled', 'published', 'measuring']

// ── small inline toast ────────────────────────────────────────────────────────
function Toast({ tone = 'good', children, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4200)
    return () => clearTimeout(t)
  }, [onClose])
  const cls = tone === 'bad' ? 'bg-bad-bg text-bad' : 'bg-good-bg text-good'
  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm">
      <div className={cx('rounded-xl px-4 py-3 text-sm shadow-card', cls)}>
        {children}
      </div>
    </div>
  )
}

// ── Section A: idea-approval card ─────────────────────────────────────────────
function IdeaCard({ idea, busy, onApprove, onReject, onFanout }) {
  const approved = idea.status === 'approved'
  return (
    <Card className="card-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip variant="clay">{idea.angle || 'Идея'}</Chip>
            {idea.product_title && (
              <span className="text-xs text-muted truncate">{idea.product_title}</span>
            )}
            {approved && <Chip variant="good">Одобрено</Chip>}
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
              {idea.hashtags.map((h) => (
                <span key={h}>{h.replace(/^#/, '')}</span>
              ))}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {approved ? (
          <Btn variant="primary" disabled={busy} onClick={() => onFanout(idea.id)}>
            <Share2 size={14} /> Развести по платформам
          </Btn>
        ) : (
          <>
            <Btn variant="primary" disabled={busy} onClick={() => onApprove(idea.id)}>
              <Check size={14} /> Одобрить
            </Btn>
            <Btn variant="ghost" disabled={busy} onClick={() => onReject(idea.id)}>
              <X size={14} /> Отклонить
            </Btn>
          </>
        )}
      </div>
    </Card>
  )
}

// ── Section B: compact post card ──────────────────────────────────────────────
function PostCard({ post, busy, onAsset, onApprove, onPublished }) {
  const st = POST_STATE[post.state] || POST_STATE.idea
  const views = post.latest?.views
  return (
    <div className="card card-pad !p-3 transition-shadow hover:shadow-card">
      <div className="flex items-center justify-between gap-2">
        <PlatformDot platform={post.platform} />
        <Chip variant={st.variant}>{st.label}</Chip>
      </div>
      <p className="mt-2 text-sm font-semibold text-ink leading-snug line-clamp-1">
        {post.product_title || 'Без товара'}
      </p>
      {post.caption_final && (
        <p className="mt-1 text-xs text-ink-soft leading-relaxed line-clamp-2">
          {post.caption_final}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-muted tabular-nums">
          <Eye size={12} /> {views != null ? fmtInt(views) : '—'}
        </span>
        <div className="flex items-center gap-1.5">
          {post.state === 'idea' && (
            <Btn variant="outline" className="!px-2 !py-1 !text-xs" disabled={busy}
              onClick={() => onAsset(post)}>
              <Paperclip size={12} /> Ассет
            </Btn>
          )}
          {post.state === 'asset_ready' && (
            <Btn variant="primary" className="!px-2 !py-1 !text-xs" disabled={busy}
              onClick={() => onApprove(post.id)}>
              <Check size={12} /> Одобрить
            </Btn>
          )}
          {(post.state === 'approved' || post.state === 'scheduled') && (
            <Btn variant="outline" className="!px-2 !py-1 !text-xs" disabled={busy}
              onClick={() => onPublished(post.id)}>
              <Send size={12} /> Опубликовано
            </Btn>
          )}
        </div>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function Pipeline() {
  const kanban = useApi('/posts/kanban')
  const ideas = useApi('/content/ideas?status=draft')
  const products = useApi('/products')

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [genError, setGenError] = useState(null)
  const [genBusy, setGenBusy] = useState(false)

  // generator form
  const [genProduct, setGenProduct] = useState('')
  const [genN, setGenN] = useState(3)

  const productList = products.data || []
  useEffect(() => {
    if (!genProduct && productList.length) setGenProduct(String(productList[0].id))
  }, [productList, genProduct])

  const reloadAll = () => { kanban.reload(); ideas.reload() }
  const showToast = (children, tone = 'good') => setToast({ children, tone })

  // ── Section A actions ───────────────────────────────────────────────────────
  async function ideaAction(id, verb) {
    setBusy(true)
    try {
      await api.post(`/content/ideas/${id}/${verb}`)
      ideas.reload()
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Не удалось выполнить действие', 'bad')
    } finally { setBusy(false) }
  }

  async function fanout(id) {
    setBusy(true)
    try {
      const r = await api.post(`/content/ideas/${id}/fanout`, {})
      const n = r.data?.posts?.length ?? 0
      showToast(`Создано постов: ${n}`)
      reloadAll()
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Не удалось развести по платформам', 'bad')
    } finally { setBusy(false) }
  }

  async function generate() {
    if (!genProduct) return
    setGenBusy(true); setGenError(null)
    try {
      const r = await api.post('/content/ideas/generate', {
        product_id: Number(genProduct),
        n: Number(genN) || 1,
      })
      const cnt = r.data?.ideas?.length ?? 0
      const cost = r.data?.run_cost
      showToast(
        `Сгенерировано идей: ${cnt}` +
        (cost != null ? ` · стоимость ${typeof cost === 'number' ? cost.toFixed(4) : cost} $` : ''),
      )
      ideas.reload()
    } catch (e) {
      setGenError(e?.response?.data?.detail || e.message || 'Ошибка генерации')
    } finally { setGenBusy(false) }
  }

  // ── Section B actions ───────────────────────────────────────────────────────
  async function attachAsset(post) {
    const url = window.prompt('Публичная ссылка на ассет (видео/изображение):')
    if (!url) return
    setBusy(true)
    try {
      await api.post(`/content/ideas/${post.content_idea_id}/asset/manual`, { public_url: url.trim() })
      showToast('Ассет прикреплён')
      kanban.reload()
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Не удалось прикрепить ассет', 'bad')
    } finally { setBusy(false) }
  }

  async function approvePost(id) {
    setBusy(true)
    try {
      await api.post(`/posts/${id}/approve`)
      showToast('Пост одобрен')
      kanban.reload()
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Не удалось одобрить', 'bad')
    } finally { setBusy(false) }
  }

  async function markPublished(id) {
    const ppid = window.prompt('ID публикации на платформе (platform_post_id):')
    if (!ppid) return
    setBusy(true)
    try {
      await api.post(`/posts/${id}/published`, { platform_post_id: ppid.trim() })
      showToast('Отмечено как опубликовано')
      kanban.reload()
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Не удалось отметить', 'bad')
    } finally { setBusy(false) }
  }

  const draftIdeas = ideas.data || []
  const board = kanban.data || {}
  const totalPosts = useMemo(
    () => KANBAN_COLUMNS.reduce((s, c) => s + (board[c]?.length || 0), 0),
    [board],
  )

  // ── generator control (Section A header right) ──────────────────────────────
  const generator = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input !py-1.5 !text-sm max-w-[200px]"
        value={genProduct}
        onChange={(e) => setGenProduct(e.target.value)}
        disabled={!productList.length || genBusy}
      >
        {!productList.length && <option value="">Нет товаров</option>}
        {productList.map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </select>
      <input
        type="number" min={1} max={10}
        className="input !py-1.5 !text-sm w-16"
        value={genN}
        onChange={(e) => setGenN(e.target.value)}
        disabled={genBusy}
      />
      <Btn variant="primary" onClick={generate} disabled={genBusy || !genProduct}>
        {genBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Сгенерировать идеи (Claude)
      </Btn>
    </div>
  )

  return (
    <div className="space-y-8">
      {toast && (
        <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.children}</Toast>
      )}

      {/* ── SECTION A ── */}
      <Section
        title="Идеи на одобрение"
        sub="Просмотрите черновики и разведите одобренные по платформам"
        right={generator}
      >
        {genError && <ErrorNote>{genError}</ErrorNote>}

        {ideas.loading ? (
          <Card><Loading label="Загрузка идей…" /></Card>
        ) : ideas.error ? (
          <ErrorNote>{ideas.error}</ErrorNote>
        ) : draftIdeas.length === 0 ? (
          <Card>
            <EmptyState
              icon={Lightbulb}
              title="Нет черновиков идей"
              hint="Сгенерируйте идеи для выбранного товара через Claude — они появятся здесь на одобрение."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {draftIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                busy={busy}
                onApprove={(id) => ideaAction(id, 'approve')}
                onReject={(id) => ideaAction(id, 'reject')}
                onFanout={fanout}
              />
            ))}
          </div>
        )}
      </Section>

      {/* ── SECTION B ── */}
      <Section
        title="Конвейер"
        sub={kanban.loading || kanban.error ? undefined : `Постов в работе: ${fmtInt(totalPosts)}`}
      >
        {kanban.loading ? (
          <Card><Loading label="Загрузка конвейера…" /></Card>
        ) : kanban.error ? (
          <ErrorNote>{kanban.error}</ErrorNote>
        ) : totalPosts === 0 ? (
          <Card>
            <EmptyState
              icon={Workflow}
              title="Конвейер пуст"
              hint="Одобрите идею и разведите её по платформам — посты появятся в колонках ниже."
            />
          </Card>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="flex overflow-x-auto divide-x divide-line-soft">
              {KANBAN_COLUMNS.map((col) => {
                const st = POST_STATE[col]
                const items = board[col] || []
                return (
                  <div key={col} className="flex-shrink-0 w-64 flex flex-col">
                    <div className="flex items-center justify-between px-3.5 py-3 border-b border-line-soft bg-surface/40">
                      <span className="text-xs font-semibold text-ink-soft">{st.label}</span>
                      <span className="text-xs text-faint tabular-nums">{items.length}</span>
                    </div>
                    <div className="flex flex-col gap-2.5 p-2.5 overflow-y-auto max-h-[640px] min-h-[120px]">
                      {items.length === 0 ? (
                        <p className="text-xs text-faint text-center py-6">—</p>
                      ) : (
                        items.map((post) => (
                          <PostCard
                            key={post.id}
                            post={post}
                            busy={busy}
                            onAsset={attachAsset}
                            onApprove={approvePost}
                            onPublished={markPublished}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </Section>
    </div>
  )
}
